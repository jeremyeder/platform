#!/usr/bin/env bash
#
# bootstrap-workspace.sh — Automate developer workspace setup after kind-up
#
# Reads credentials from .dev-bootstrap.env and calls the backend REST API
# to create a workspace, set the Anthropic API key, and connect integrations.
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="$PROJECT_ROOT/.dev-bootstrap.env"

BACKEND_PORT="${BACKEND_PORT:-8081}"
BACKEND_URL="http://localhost:${BACKEND_PORT}"
NAMESPACE="${NAMESPACE:-ambient-code}"
FORWARDED_USER="system:serviceaccount:${NAMESPACE}:test-user"
PORT_FORWARD_PID=""

# Colors (match Makefile conventions)
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_ok()   { echo -e "  ${GREEN}[OK]${NC}   $1"; }
log_skip() { echo -e "  ${YELLOW}[SKIP]${NC} $1"; }
log_fail() { echo -e "  ${RED}[FAIL]${NC} $1"; }
log_info() { echo -e "  ${BLUE}[INFO]${NC} $1"; }

cleanup() {
    if [ -n "$PORT_FORWARD_PID" ] && kill -0 "$PORT_FORWARD_PID" 2>/dev/null; then
        kill "$PORT_FORWARD_PID" 2>/dev/null || true
        wait "$PORT_FORWARD_PID" 2>/dev/null || true
    fi
}
trap cleanup EXIT

# --- Check dependencies ---
for cmd in curl jq kubectl; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo -e "${RED}Error:${NC} '$cmd' is required but not found"
        exit 1
    fi
done

# --- Load config ---
if [ ! -f "$ENV_FILE" ]; then
    echo -e "${RED}Error:${NC} .dev-bootstrap.env not found"
    echo ""
    echo "  Create it from the template:"
    echo "    cp .dev-bootstrap.env.example .dev-bootstrap.env"
    echo "    # Edit with your credentials"
    echo ""
    exit 1
fi

# Source the env file (supports ${VAR} indirection)
set -a
# shellcheck disable=SC1090
source "$ENV_FILE"
set +a

WORKSPACE_NAME="${BOOTSTRAP_WORKSPACE_NAME:-}"
WORKSPACE_DISPLAY="${BOOTSTRAP_WORKSPACE_DISPLAY_NAME:-}"
ANTHROPIC_KEY="${BOOTSTRAP_ANTHROPIC_API_KEY:-}"
GITHUB_PAT="${BOOTSTRAP_GITHUB_PAT:-}"
JIRA_URL="${BOOTSTRAP_JIRA_URL:-}"
JIRA_EMAIL="${BOOTSTRAP_JIRA_EMAIL:-}"
JIRA_TOKEN="${BOOTSTRAP_JIRA_API_TOKEN:-}"
GITLAB_PAT="${BOOTSTRAP_GITLAB_PAT:-}"
GITLAB_URL="${BOOTSTRAP_GITLAB_INSTANCE_URL:-https://gitlab.com}"

if [ -z "$WORKSPACE_NAME" ]; then
    echo -e "${RED}Error:${NC} BOOTSTRAP_WORKSPACE_NAME is required in .dev-bootstrap.env"
    exit 1
fi

# --- Get auth token ---
get_token() {
    local token

    # Try e2e/.env.test first (populated by extract-token.sh during kind-up)
    local env_test="$PROJECT_ROOT/e2e/.env.test"
    if [ -f "$env_test" ]; then
        token=$(grep '^TEST_TOKEN=' "$env_test" 2>/dev/null | head -1 | cut -d'=' -f2-)
        if [ -n "$token" ]; then
            echo "$token"
            return 0
        fi
    fi

    # Fall back to extracting from secret directly
    token=$(kubectl get secret test-user-token -n "$NAMESPACE" -o jsonpath='{.data.token}' 2>/dev/null | base64 -d 2>/dev/null)
    if [ -n "$token" ]; then
        echo "$token"
        return 0
    fi

    return 1
}

TOKEN=$(get_token) || {
    echo -e "${RED}Error:${NC} Could not retrieve auth token"
    echo "  Ensure 'make kind-up' has completed or e2e/.env.test exists"
    exit 1
}

# --- Detect/start port-forward ---
ensure_port_forward() {
    if curl -sf "${BACKEND_URL}/health" >/dev/null 2>&1; then
        return 0
    fi

    log_info "Starting temporary port-forward to backend..."
    kubectl port-forward -n "$NAMESPACE" svc/backend-service "${BACKEND_PORT}:8080" >/dev/null 2>&1 &
    PORT_FORWARD_PID=$!

    for _i in $(seq 1 15); do
        if curl -sf "${BACKEND_URL}/health" >/dev/null 2>&1; then
            return 0
        fi
        sleep 1
    done

    log_fail "Backend not reachable at ${BACKEND_URL} after 15s"
    return 1
}

ensure_port_forward || exit 1

# Helper: make an authenticated API call, returns HTTP status code.
# Response body is written to a temp file for error reporting.
RESPONSE_BODY=$(mktemp)
# shellcheck disable=SC2064
trap "rm -f '$RESPONSE_BODY'; cleanup" EXIT

api_call() {
    local method="$1"
    local path="$2"
    local data="${3:-}"

    local args=(-s -o "$RESPONSE_BODY" -w "%{http_code}" -X "$method"
        -H "Authorization: Bearer ${TOKEN}"
        -H "X-Forwarded-User: ${FORWARDED_USER}"
        -H "Content-Type: application/json"
    )

    if [ -n "$data" ]; then
        args+=(-d "$data")
    fi

    curl "${args[@]}" "${BACKEND_URL}${path}"
}

echo ""
echo -e "${BLUE}▶${NC} Bootstrapping workspace '${WORKSPACE_NAME}'..."
echo ""

# --- Step 1: Create workspace ---
payload=$(jq -nc --arg n "$WORKSPACE_NAME" --arg d "$WORKSPACE_DISPLAY" \
    '{name: $n, displayName: $d}')
http_code=$(api_call POST "/api/projects" "$payload")

case "$http_code" in
    201) log_ok "Created workspace '${WORKSPACE_NAME}'" ;;
    409) log_ok "Workspace '${WORKSPACE_NAME}' already exists" ;;
    *)   log_fail "Create workspace (HTTP ${http_code})"
         jq -r '.error // .' "$RESPONSE_BODY" 2>/dev/null || cat "$RESPONSE_BODY"
         exit 1 ;;
esac

# --- Step 2: Set Anthropic API key ---
if [ -n "$ANTHROPIC_KEY" ]; then
    payload=$(jq -nc --arg k "$ANTHROPIC_KEY" '{data: {ANTHROPIC_API_KEY: $k}}')
    http_code=$(api_call PUT "/api/projects/${WORKSPACE_NAME}/runner-secrets" "$payload")

    case "$http_code" in
        200) log_ok "Set ANTHROPIC_API_KEY" ;;
        *)   log_fail "Set ANTHROPIC_API_KEY (HTTP ${http_code})" ;;
    esac
else
    log_skip "ANTHROPIC_API_KEY not configured"
fi

# --- Step 3: Connect GitHub PAT ---
if [ -n "$GITHUB_PAT" ]; then
    payload=$(jq -nc --arg t "$GITHUB_PAT" '{token: $t}')
    http_code=$(api_call POST "/api/auth/github/pat" "$payload")

    case "$http_code" in
        200) log_ok "Connected GitHub PAT" ;;
        *)   log_fail "Connect GitHub PAT (HTTP ${http_code})" ;;
    esac
else
    log_skip "GitHub PAT not configured"
fi

# --- Step 4: Connect Jira ---
if [ -n "$JIRA_URL" ] && [ -n "$JIRA_EMAIL" ] && [ -n "$JIRA_TOKEN" ]; then
    payload=$(jq -nc --arg u "$JIRA_URL" --arg e "$JIRA_EMAIL" --arg t "$JIRA_TOKEN" \
        '{url: $u, email: $e, apiToken: $t}')
    http_code=$(api_call POST "/api/auth/jira/connect" "$payload")

    case "$http_code" in
        200) log_ok "Connected Jira (${JIRA_URL})" ;;
        *)   log_fail "Connect Jira (HTTP ${http_code})" ;;
    esac
else
    log_skip "Jira not configured (need url + email + apiToken)"
fi

# --- Step 5: Connect GitLab ---
if [ -n "$GITLAB_PAT" ]; then
    payload=$(jq -nc --arg t "$GITLAB_PAT" --arg u "$GITLAB_URL" \
        '{personalAccessToken: $t, instanceUrl: $u}')
    http_code=$(api_call POST "/api/auth/gitlab/connect" "$payload")

    case "$http_code" in
        200) log_ok "Connected GitLab (${GITLAB_URL})" ;;
        *)   log_fail "Connect GitLab (HTTP ${http_code})" ;;
    esac
else
    log_skip "GitLab PAT not configured"
fi

echo ""
echo -e "${GREEN}✓${NC} Bootstrap complete"

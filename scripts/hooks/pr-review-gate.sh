#!/usr/bin/env bash
# pr-review-gate.sh — PreToolUse hook for Bash tool calls.
# Gates `gh pr create` behind mechanical code quality checks and
# CodeRabbit AI review. Stateless: runs checks inline on every attempt.
#
# Exit codes (Claude Code PreToolUse convention):
#   0 = allow the tool call
#   2 = block the tool call (stderr shown to agent as reason)
set -euo pipefail

# ── Parse tool input ───────────────────────────────────────────────────
# Claude Code passes Bash tool input as JSON in $CLAUDE_TOOL_INPUT.
COMMAND=$(echo "$CLAUDE_TOOL_INPUT" | jq -r '.command // ""')

# Only gate `gh pr create` commands
if ! echo "$COMMAND" | grep -qE '^\s*gh\s+pr\s+create\b'; then
    exit 0
fi

echo "PR Review Gate: checking code quality before opening PR..." >&2

REPO_ROOT="$(git rev-parse --show-toplevel)"
ERRORS=""

# ── Determine changed files against the base branch ───────────────────
BASE_BRANCH="main"
CHANGED_FILES=$(git diff --name-only "$BASE_BRANCH"...HEAD 2>/dev/null || git diff --name-only HEAD~1)

if [ -z "$CHANGED_FILES" ]; then
    echo "PR Review Gate: no changed files detected, allowing" >&2
    exit 0
fi

# ── Go checks ─────────────────────────────────────────────────────────
GO_FILES=$(echo "$CHANGED_FILES" | grep '\.go$' || true)
if [ -n "$GO_FILES" ]; then
    # Find all unique Go module directories with changes
    GO_MODULES=$(echo "$GO_FILES" | while read -r f; do
        dir=$(dirname "$f")
        while [ "$dir" != "." ]; do
            if [ -f "$REPO_ROOT/$dir/go.mod" ]; then
                echo "$dir"
                break
            fi
            dir=$(dirname "$dir")
        done
    done | sort -u)

    for mod in $GO_MODULES; do
        # gofmt
        if command -v gofmt &>/dev/null; then
            MOD_GO_FILES=$(echo "$GO_FILES" | grep "^$mod/" || true)
            if [ -n "$MOD_GO_FILES" ]; then
                UNFORMATTED=$(cd "$REPO_ROOT" && echo "$MOD_GO_FILES" | xargs gofmt -l 2>/dev/null || true)
                if [ -n "$UNFORMATTED" ]; then
                    ERRORS="${ERRORS}\ngofmt: unformatted files:\n${UNFORMATTED}"
                fi
            fi
        fi

        # go vet
        if command -v go &>/dev/null; then
            VET_OUTPUT=$(cd "$REPO_ROOT/$mod" && go vet ./... 2>&1) || \
                ERRORS="${ERRORS}\ngo vet failed in ${mod}:\n${VET_OUTPUT}"
        fi
    done

    # No panic() in production code (exclude tests)
    PANIC_HITS=$(echo "$GO_FILES" | grep -v '_test\.go$' | while read -r f; do
        if [ -f "$REPO_ROOT/$f" ]; then
            grep -n 'panic(' "$REPO_ROOT/$f" 2>/dev/null | grep -v '//.*panic' | grep -v 'nolint' | sed "s|^|  $f:|" || true
        fi
    done || true)
    if [ -n "$PANIC_HITS" ]; then
        ERRORS="${ERRORS}\npanic() in production code (use fmt.Errorf):\n${PANIC_HITS}"
    fi
fi

# ── Frontend checks ──────────────────────────────────────────────────
TS_FILES=$(echo "$CHANGED_FILES" | grep -E '^components/frontend/.*\.(ts|tsx|js|jsx)$' || true)
if [ -n "$TS_FILES" ]; then
    FRONTEND_DIR="$REPO_ROOT/components/frontend"

    # eslint
    if command -v npx &>/dev/null && [ -d "$FRONTEND_DIR/node_modules" ]; then
        RELATIVE_FILES=$(echo "$TS_FILES" | sed 's|^components/frontend/||')
        ESLINT_OUTPUT=$(cd "$FRONTEND_DIR" && echo "$RELATIVE_FILES" | xargs npx eslint 2>&1) || \
            ERRORS="${ERRORS}\neslint failed on frontend files:\n${ESLINT_OUTPUT}"
    fi

    # No `any` types
    ANY_HITS=$(echo "$TS_FILES" | while read -r f; do
        if [ -f "$REPO_ROOT/$f" ]; then
            grep -n ': any\b\|<any>\|as any\b' "$REPO_ROOT/$f" 2>/dev/null | grep -v '//.*any\|nolint\|eslint-disable' | sed "s|^|  $f:|" || true
        fi
    done || true)
    if [ -n "$ANY_HITS" ]; then
        ERRORS="${ERRORS}\n'any' type usage in frontend (use proper types, unknown, or generics):\n${ANY_HITS}"
    fi
fi

# ── Python checks ────────────────────────────────────────────────────
PY_FILES=$(echo "$CHANGED_FILES" | grep -E '^(components/runners/|scripts/).*\.py$' || true)
if [ -n "$PY_FILES" ]; then
    if command -v ruff &>/dev/null; then
        RUFF_CHECK=$(cd "$REPO_ROOT" && echo "$PY_FILES" | xargs ruff check 2>&1) || \
            ERRORS="${ERRORS}\nruff check failed:\n${RUFF_CHECK}"
        RUFF_FMT=$(cd "$REPO_ROOT" && echo "$PY_FILES" | xargs ruff format --check 2>&1) || \
            ERRORS="${ERRORS}\nruff format failed:\n${RUFF_FMT}"
    fi
fi

# ── Diff sanity ──────────────────────────────────────────────────────
DIFF_CONTENT=$(git diff "$BASE_BRANCH"...HEAD 2>/dev/null || git diff HEAD~1)
SECRET_PATTERNS='(PRIVATE[_-]KEY|SECRET[_-]KEY|API[_-]KEY|PASSWORD|TOKEN)\s*[=:]\s*["'"'"'][^\s]+'
SECRET_HITS=$(echo "$DIFF_CONTENT" | grep -iE "$SECRET_PATTERNS" | grep '^\+' | head -5 || true)
if [ -n "$SECRET_HITS" ]; then
    ERRORS="${ERRORS}\nPossible secrets in diff:\n${SECRET_HITS}"
fi

# ── Bail early if mechanical checks failed ───────────────────────────
if [ -n "$ERRORS" ]; then
    echo "" >&2
    echo "=================================================" >&2
    echo "PR Review Gate: BLOCKED — fix these issues first" >&2
    echo "=================================================" >&2
    echo -e "$ERRORS" >&2
    echo "" >&2
    echo "Fix these issues and retry gh pr create." >&2
    exit 2
fi

# ── CodeRabbit AI review ────────────────────────────────────────────
# Runs the full AI review against the branch diff using .coderabbit.yaml
# config (security, performance, K8s safety custom checks).
# Skips gracefully if CLI or auth is unavailable.
if command -v coderabbit &>/dev/null; then
    echo "PR Review Gate: running CodeRabbit review..." >&2

    CR_OUTPUT=$(coderabbit review --agent --base "$BASE_BRANCH" 2>&1 || true)
    CR_EXIT=${PIPESTATUS[0]:-$?}

    # Check for auth/rate-limit issues — treat as warnings, not blockers
    if echo "$CR_OUTPUT" | grep -qiE 'unauthorized|rate.limit|auth.*fail|403'; then
        echo "PR Review Gate: CodeRabbit skipped (auth/rate-limit)" >&2
    elif [ -n "$CR_OUTPUT" ]; then
        # Parse agent output for blocking findings (severity: error)
        BLOCKING=$(echo "$CR_OUTPUT" | jq -r \
            '.findings[]? | select(.severity == "error") | "  \(.file):\(.line) — \(.message)"' \
            2>/dev/null || true)

        if [ -n "$BLOCKING" ]; then
            ERRORS="${ERRORS}\nCodeRabbit found blocking issues:\n${BLOCKING}"
        else
            echo "PR Review Gate: CodeRabbit review passed" >&2
        fi
    fi
else
    echo "PR Review Gate: CodeRabbit CLI not found — skipping AI review" >&2
fi

# ── Final report ─────────────────────────────────────────────────────
if [ -n "$ERRORS" ]; then
    echo "" >&2
    echo "=================================================" >&2
    echo "PR Review Gate: BLOCKED — fix these issues first" >&2
    echo "=================================================" >&2
    echo -e "$ERRORS" >&2
    echo "" >&2
    echo "Fix these issues and retry gh pr create." >&2
    exit 2
fi

echo "PR Review Gate: all checks passed" >&2
exit 0

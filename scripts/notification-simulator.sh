#!/usr/bin/env bash
# notification-simulator.sh — Creates sessions across multiple projects in
# various notification-worthy states (waiting_input, completed, failed, stopped)
# using direct CR creation (no API key needed).
#
# Usage: ./scripts/notification-simulator.sh
#
# Requires: kubectl
# Expects: A running kind cluster with the ACP deployed.

set -euo pipefail

NAMESPACE="${NAMESPACE:-ambient-code}"

echo "=== Notification Simulator ==="
echo ""

# ── Step 1: Create project namespaces ────────────────────────────────

for proj in "demo-frontend" "infra-ops"; do
  echo -n "Creating project '$proj'... "
  if kubectl get namespace "$proj" &>/dev/null; then
    echo "exists"
  else
    kubectl create namespace "$proj"
    kubectl label namespace "$proj" \
      app=vteam \
      ambient-code.io/managed=true \
      name="$proj" 2>/dev/null
    echo "created"
  fi
done

# ── Scale down operator to prevent status reconciliation ─────────────

echo -n "Scaling down operator... "
kubectl scale deployment agentic-operator -n "$NAMESPACE" --replicas=0 2>/dev/null
echo "done"
echo ""

# ── Timestamps ───────────────────────────────────────────────────────

NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
FIVE_MIN_AGO=$(date -u -v-5M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "5 minutes ago" +"%Y-%m-%dT%H:%M:%SZ")
TEN_MIN_AGO=$(date -u -v-10M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "10 minutes ago" +"%Y-%m-%dT%H:%M:%SZ")

# ── Step 2: Create session CRs ──────────────────────────────────────

create_session() {
  local ns="$1" name="$2" display="$3" phase="$4" extra_status="$5"

  echo -n "  $name ($display) → $phase ... "

  cat <<EOF | kubectl apply -f - 2>/dev/null
apiVersion: vteam.ambient-code/v1alpha1
kind: AgenticSession
metadata:
  name: $name
  namespace: $ns
spec:
  initialPrompt: "Simulated session"
  displayName: "$display"
  timeout: 3600
  llmSettings:
    model: claude-sonnet-4-20250514
    temperature: 0
    maxTokens: 8096
EOF

  # Patch status subresource
  kubectl patch agenticsession "$name" -n "$ns" --type=merge --subresource=status \
    -p "{\"status\":{\"phase\":\"$phase\",\"startTime\":\"$TEN_MIN_AGO\"${extra_status}}}" 2>/dev/null

  echo "done"
}

echo ""
echo "Creating sessions in 'demo-frontend'..."

create_session "demo-frontend" "sim-login-fix" \
  "Fix login button alignment" \
  "Running" \
  ",\"lastActivityTime\":\"$NOW\""

create_session "demo-frontend" "sim-dark-mode" \
  "Add dark mode toggle" \
  "Completed" \
  ",\"completionTime\":\"$FIVE_MIN_AGO\",\"lastActivityTime\":\"$FIVE_MIN_AGO\""

create_session "demo-frontend" "sim-auth-refactor" \
  "Refactor auth hooks" \
  "Failed" \
  ",\"completionTime\":\"$NOW\",\"lastActivityTime\":\"$NOW\""

echo ""
echo "Creating sessions in 'infra-ops'..."

create_session "infra-ops" "sim-k8s-upgrade" \
  "Upgrade K8s to 1.31" \
  "Running" \
  ",\"lastActivityTime\":\"$NOW\""

create_session "infra-ops" "sim-ci-fix" \
  "Fix flaky CI pipeline" \
  "Stopped" \
  ",\"completionTime\":\"$FIVE_MIN_AGO\",\"lastActivityTime\":\"$FIVE_MIN_AGO\",\"stoppedReason\":\"user\""

# ── Step 3: Write event logs for waiting_input sessions ──────────────

BACKEND_POD=$(kubectl get pod -n "$NAMESPACE" -l app=backend-api -o jsonpath='{.items[0].metadata.name}')
echo ""
echo "Writing event logs to backend pod ($BACKEND_POD) for waiting_input..."

write_waiting_input_events() {
  local session_name="$1"
  local run_id
  run_id=$(uuidgen | tr '[:upper:]' '[:lower:]' 2>/dev/null || cat /proc/sys/kernel/random/uuid 2>/dev/null || echo "run-$(date +%s)")

  local line1="{\"type\":\"RUN_STARTED\",\"runId\":\"$run_id\",\"timestamp\":\"$TEN_MIN_AGO\"}"
  local line2="{\"type\":\"TOOL_CALL_START\",\"runId\":\"$run_id\",\"toolCallId\":\"tc-1\",\"toolCallName\":\"AskUserQuestion\",\"timestamp\":\"$NOW\"}"

  kubectl exec "$BACKEND_POD" -n "$NAMESPACE" -c backend-api -- \
    sh -c "mkdir -p /workspace/sessions/$session_name && printf '%s\n%s\n' '$line1' '$line2' > /workspace/sessions/$session_name/agui-events.jsonl"

  echo "  Wrote event log for $session_name → waiting_input"
}

write_waiting_input_events "sim-login-fix"
write_waiting_input_events "sim-k8s-upgrade"

echo ""
echo "=== Simulation Complete ==="
echo ""
echo "Notifications created:"
echo "  demo-frontend:"
echo "    - sim-login-fix:     Fix login button alignment  → waiting_input"
echo "    - sim-dark-mode:     Add dark mode toggle        → completed (5m ago)"
echo "    - sim-auth-refactor: Refactor auth hooks         → failed (just now)"
echo "  infra-ops:"
echo "    - sim-k8s-upgrade:   Upgrade K8s to 1.31        → waiting_input"
echo "    - sim-ci-fix:        Fix flaky CI pipeline       → stopped (5m ago)"
echo ""
echo "The Gift icon in the nav bar should show a badge with 5 notifications."

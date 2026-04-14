#!/usr/bin/env bash
# reproduce-oom.sh — Push the agentic-operator to OOMKill on a local kind cluster.
#
# Creates bulk namespaces (with the managed label that triggers ProjectSettings +
# RBAC cascade) and AgenticSession CRs to fill the controller-runtime cache until
# the operator exceeds its deliberately undersized memory limit.
#
# Usage: ./scripts/scalability/reproduce-oom.sh [OPTIONS]
set -euo pipefail

# ── Defaults ──────────────────────────────────────────────────────────────────
MEM_LIMIT="128Mi"
NAMESPACES=1000
SESSIONS_PER_NS=10
BATCH_SIZE=50
PPROF=false
CLEANUP=false

OPERATOR_NS="ambient-code"
OPERATOR_DEPLOY="agentic-operator"
LABEL_REPRODUCER="app.kubernetes.io/part-of=oom-reproducer"
PPROF_DIR="pprof-dumps"
PPROF_RUN_DIR=""
PF_PID=""
LOG_DIR="scalability-runs"
LOG_FILE=""

# ── Usage ─────────────────────────────────────────────────────────────────────
usage() {
  cat <<EOF
Usage: $(basename "$0") [OPTIONS]

Push the agentic-operator to OOMKill on a local kind cluster by undersizing
its memory limit and creating bulk Kubernetes resources.

Options:
  --mem-limit       Operator memory limit (default: $MEM_LIMIT)
  --namespaces      Number of namespaces to create (default: $NAMESPACES)
  --sessions-per-ns Sessions per namespace (default: $SESSIONS_PER_NS)
  --batch-size      Namespaces to create per batch (default: $BATCH_SIZE)
  --pprof           Capture heap profile between batches
  --cleanup         Remove test resources and restore operator on exit
  --help            Show usage
EOF
  exit 0
}

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --mem-limit)       MEM_LIMIT="$2"; shift 2 ;;
    --namespaces)      NAMESPACES="$2"; shift 2 ;;
    --sessions-per-ns) SESSIONS_PER_NS="$2"; shift 2 ;;
    --batch-size)      BATCH_SIZE="$2"; shift 2 ;;
    --pprof)           PPROF=true; shift ;;
    --cleanup)         CLEANUP=true; shift ;;
    --help)            usage ;;
    *) echo "Unknown option: $1"; usage ;;
  esac
done

# ── Log file setup ───────────────────────────────────────────────────────────
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/oom-repro-$(date +%Y%m%dT%H%M%S).log"
exec > >(tee -a "$LOG_FILE") 2>&1
echo "Log file: $LOG_FILE"
echo ""

# ── Helper functions ──────────────────────────────────────────────────────────

get_operator_pod() {
  kubectl get pods -n "$OPERATOR_NS" -l app=agentic-operator \
    --field-selector=status.phase=Running \
    -o jsonpath='{.items[0].metadata.name}' 2>/dev/null || true
}

get_restart_count() {
  kubectl get pods -n "$OPERATOR_NS" -l app=agentic-operator \
    -o jsonpath='{.items[0].status.containerStatuses[0].restartCount}' 2>/dev/null || echo "0"
}

get_memory_usage() {
  # Use pprof if port-forward is running (most reliable on kind without metrics-server)
  if [[ -n "${PF_PID:-}" ]] && kill -0 "$PF_PID" 2>/dev/null; then
    local heap_bytes
    heap_bytes=$(curl -sf "http://localhost:6060/debug/pprof/heap?debug=1" 2>/dev/null \
      | grep "# HeapInuse" | awk -F'= ' '{print $2}' || true)
    if [[ -n "$heap_bytes" && "$heap_bytes" -gt 0 ]] 2>/dev/null; then
      echo "$((heap_bytes / 1024 / 1024))Mi"
      return
    fi
  fi
  # Fall back to kubectl top (requires metrics-server)
  kubectl top pod -n "$OPERATOR_NS" -l app=agentic-operator \
    --no-headers 2>/dev/null | awk '{print $3}' || echo "N/A"
}

is_oomkilled() {
  local reason
  reason=$(kubectl get pods -n "$OPERATOR_NS" -l app=agentic-operator \
    -o jsonpath='{.items[0].status.containerStatuses[0].lastState.terminated.reason}' 2>/dev/null || true)
  [[ "$reason" == "OOMKilled" ]]
}

start_port_forward() {
  # Start persistent port-forward to operator pprof endpoint
  local pod
  pod=$(get_operator_pod)
  if [[ -z "$pod" ]]; then
    echo "  [pprof] No running operator pod found, cannot start port-forward."
    return 1
  fi
  kubectl port-forward -n "$OPERATOR_NS" "pod/$pod" 6060:6060 >/dev/null 2>&1 &
  PF_PID=$!
  sleep 2
  if ! kill -0 "$PF_PID" 2>/dev/null; then
    echo "  [pprof] Port-forward failed to start."
    PF_PID=""
    return 1
  fi
  echo "  [pprof] Port-forward to $pod:6060 started (pid $PF_PID)."
  return 0
}

capture_heap_profile() {
  local batch_num="$1"

  # Ensure port-forward is alive (operator may have restarted)
  if [[ -z "${PF_PID:-}" ]] || ! kill -0 "$PF_PID" 2>/dev/null; then
    PF_PID=""
    start_port_forward || return
  fi

  local outfile
  outfile="$PPROF_RUN_DIR/heap-batch-$(printf '%04d' "$batch_num").pb.gz"
  if curl -sS "http://localhost:6060/debug/pprof/heap" -o "$outfile" 2>/dev/null; then
    echo "  [pprof] Saved heap profile: $outfile"
  else
    echo "  [pprof] Failed to capture heap profile (operator may have restarted)."
    # Kill stale port-forward so next call reconnects
    kill "$PF_PID" 2>/dev/null || true
    wait "$PF_PID" 2>/dev/null || true
    PF_PID=""
  fi
}

# ── Cleanup trap ──────────────────────────────────────────────────────────────
cleanup_on_exit() {
  echo ""
  echo "=== Cleanup ==="

  # Kill any lingering port-forward
  if [[ -n "$PF_PID" ]]; then
    kill "$PF_PID" 2>/dev/null || true
    wait "$PF_PID" 2>/dev/null || true
  fi

  if [[ "$CLEANUP" == "true" ]]; then
    echo "Deleting test namespaces (label: $LABEL_REPRODUCER)..."
    kubectl delete namespaces -l "$LABEL_REPRODUCER" --wait=false 2>/dev/null || true

    echo "Restoring original operator resource limits..."
    if [[ -n "${ORIG_MEM_LIMIT:-}" || -n "${ORIG_CPU_LIMIT:-}" ]]; then
      local limits_arg=""
      if [[ -n "${ORIG_MEM_LIMIT:-}" ]]; then
        limits_arg="memory=${ORIG_MEM_LIMIT}"
      fi
      if [[ -n "${ORIG_CPU_LIMIT:-}" ]]; then
        [[ -n "$limits_arg" ]] && limits_arg="${limits_arg},"
        limits_arg="${limits_arg}cpu=${ORIG_CPU_LIMIT}"
      fi
      local requests_arg=""
      if [[ -n "${ORIG_MEM_REQUEST:-}" ]]; then
        requests_arg="memory=${ORIG_MEM_REQUEST}"
      fi
      if [[ -n "${ORIG_CPU_REQUEST:-}" ]]; then
        [[ -n "$requests_arg" ]] && requests_arg="${requests_arg},"
        requests_arg="${requests_arg}cpu=${ORIG_CPU_REQUEST}"
      fi
      kubectl set resources deployment/"$OPERATOR_DEPLOY" -n "$OPERATOR_NS" \
        --limits="$limits_arg" --requests="$requests_arg" >/dev/null 2>&1 || true
    fi

    echo "Removing ENABLE_PPROF and GOMEMLIMIT env vars..."
    kubectl set env deployment/"$OPERATOR_DEPLOY" -n "$OPERATOR_NS" \
      ENABLE_PPROF- GOMEMLIMIT- >/dev/null 2>&1 || true

    echo "Waiting for operator rollout..."
    kubectl rollout status deployment/"$OPERATOR_DEPLOY" -n "$OPERATOR_NS" --timeout=120s 2>/dev/null || true

    echo "Cleanup complete."
  else
    echo "Skipping cleanup (--cleanup not specified)."
    echo ""
    echo "Manual cleanup instructions:"
    echo "  kubectl delete namespaces -l $LABEL_REPRODUCER"
    echo "  kubectl set resources deployment/$OPERATOR_DEPLOY -n $OPERATOR_NS --limits=memory=${ORIG_MEM_LIMIT:-512Mi}"
    echo "  kubectl set env deployment/$OPERATOR_DEPLOY -n $OPERATOR_NS ENABLE_PPROF- GOMEMLIMIT-"
    echo "  kubectl rollout status deployment/$OPERATOR_DEPLOY -n $OPERATOR_NS --timeout=120s"
  fi
}

trap cleanup_on_exit EXIT

# ── Config summary ────────────────────────────────────────────────────────────
TOTAL_SESSIONS=$((NAMESPACES * SESSIONS_PER_NS))
TOTAL_BATCHES=$(( (NAMESPACES + BATCH_SIZE - 1) / BATCH_SIZE ))

echo "=== OOM Reproducer Configuration ==="
echo "  Memory limit:      $MEM_LIMIT"
echo "  Namespaces:        $NAMESPACES"
echo "  Sessions/NS:       $SESSIONS_PER_NS"
echo "  Total sessions:    $TOTAL_SESSIONS"
echo "  Batch size:        $BATCH_SIZE"
echo "  Total batches:     $TOTAL_BATCHES"
echo "  Pprof capture:     $PPROF"
echo "  Cleanup on exit:   $CLEANUP"
echo ""

# Create a single pprof directory for this run
if [[ "$PPROF" == "true" ]]; then
  PPROF_RUN_DIR="$PPROF_DIR/$(date +%Y%m%dT%H%M%S)"
  mkdir -p "$PPROF_RUN_DIR"
  echo "  Pprof dump dir:  $PPROF_RUN_DIR"
  echo ""
fi

# ── Preflight checks ─────────────────────────────────────────────────────────
echo "=== Preflight Checks ==="

echo -n "  Cluster reachable... "
if ! kubectl cluster-info >/dev/null 2>&1; then
  echo "FAIL"
  echo "ERROR: Cannot reach Kubernetes cluster. Run 'kubectl cluster-info' to debug."
  exit 1
fi
echo "OK"

echo -n "  Context is kind-*... "
CURRENT_CTX=$(kubectl config current-context 2>/dev/null || true)
if [[ ! "$CURRENT_CTX" =~ ^kind- ]]; then
  echo "FAIL"
  echo "ERROR: Current context is '$CURRENT_CTX', expected kind-*."
  echo "This script must only run against a local kind cluster (safety)."
  exit 1
fi
echo "OK ($CURRENT_CTX)"

echo -n "  Operator deployment exists... "
if ! kubectl get deployment "$OPERATOR_DEPLOY" -n "$OPERATOR_NS" >/dev/null 2>&1; then
  echo "FAIL"
  echo "ERROR: Deployment '$OPERATOR_DEPLOY' not found in namespace '$OPERATOR_NS'."
  echo "Run 'make kind-up' to deploy the platform first."
  exit 1
fi
echo "OK"
echo ""

# ── Save original operator state ─────────────────────────────────────────────
echo "=== Saving Original Operator State ==="
ORIG_MEM_LIMIT=$(kubectl get deployment "$OPERATOR_DEPLOY" -n "$OPERATOR_NS" \
  -o jsonpath='{.spec.template.spec.containers[0].resources.limits.memory}' 2>/dev/null || true)
ORIG_CPU_LIMIT=$(kubectl get deployment "$OPERATOR_DEPLOY" -n "$OPERATOR_NS" \
  -o jsonpath='{.spec.template.spec.containers[0].resources.limits.cpu}' 2>/dev/null || true)
ORIG_MEM_REQUEST=$(kubectl get deployment "$OPERATOR_DEPLOY" -n "$OPERATOR_NS" \
  -o jsonpath='{.spec.template.spec.containers[0].resources.requests.memory}' 2>/dev/null || true)
ORIG_CPU_REQUEST=$(kubectl get deployment "$OPERATOR_DEPLOY" -n "$OPERATOR_NS" \
  -o jsonpath='{.spec.template.spec.containers[0].resources.requests.cpu}' 2>/dev/null || true)
echo "  Memory limit:   ${ORIG_MEM_LIMIT:-<none>}"
echo "  CPU limit:      ${ORIG_CPU_LIMIT:-<none>}"
echo "  Memory request: ${ORIG_MEM_REQUEST:-<none>}"
echo "  CPU request:    ${ORIG_CPU_REQUEST:-<none>}"
echo ""

# ── Patch operator ────────────────────────────────────────────────────────────
echo "=== Patching Operator ==="

echo "  Setting memory limit to $MEM_LIMIT..."
kubectl set resources deployment/"$OPERATOR_DEPLOY" -n "$OPERATOR_NS" \
  --limits="memory=${MEM_LIMIT}" >/dev/null 2>&1

if [[ "$PPROF" == "true" ]]; then
  echo "  Enabling pprof..."
  kubectl set env deployment/"$OPERATOR_DEPLOY" -n "$OPERATOR_NS" \
    ENABLE_PPROF=true >/dev/null 2>&1
fi

echo "  Removing GOMEMLIMIT (disable GC soft limit)..."
kubectl set env deployment/"$OPERATOR_DEPLOY" -n "$OPERATOR_NS" \
  GOMEMLIMIT- >/dev/null 2>&1

echo "  Waiting for rollout..."
kubectl rollout status deployment/"$OPERATOR_DEPLOY" -n "$OPERATOR_NS" --timeout=120s 2>/dev/null

echo "  Stabilizing (5s)..."
sleep 5

# Start persistent port-forward for memory monitoring + heap capture
if [[ "$PPROF" == "true" ]]; then
  start_port_forward || true
fi
echo ""

# ── Record baseline ──────────────────────────────────────────────────────────
echo "=== Baseline ==="
BASELINE_RESTARTS=$(get_restart_count)
BASELINE_MEMORY=$(get_memory_usage)
echo "  Memory usage:  $BASELINE_MEMORY"
echo "  Restart count: $BASELINE_RESTARTS"
echo ""

# ── Main loop ─────────────────────────────────────────────────────────────────
echo "=== Creating Resources ==="
echo "  Format: [batch] namespaces | sessions | memory | restarts (delta)"
echo ""

NS_CREATED=0
SESSIONS_CREATED=0
OOMKILLED=false

for (( batch=1; batch<=TOTAL_BATCHES; batch++ )); do
  BATCH_START=$NS_CREATED
  BATCH_END=$(( BATCH_START + BATCH_SIZE ))
  if (( BATCH_END > NAMESPACES )); then
    BATCH_END=$NAMESPACES
  fi

  # Create namespaces in this batch
  for (( i=BATCH_START; i<BATCH_END; i++ )); do
    NS_NAME=$(printf "oom-repro-%04d" "$i")

    # Create namespace with labels atomically
    kubectl create namespace "$NS_NAME" --dry-run=client -o yaml 2>/dev/null | \
      kubectl label -f - --dry-run=client -o yaml --local \
        "ambient-code.io/managed=true" \
        "app.kubernetes.io/part-of=oom-reproducer" 2>/dev/null | \
      kubectl apply -f - >/dev/null 2>&1

    # Create AgenticSession CRs in this namespace and mark them Completed
    # so the cache transform can strip their spec/status (simulating
    # production where most sessions are terminal)
    for (( s=0; s<SESSIONS_PER_NS; s++ )); do
      SESSION_NAME=$(printf "repro-session-%03d" "$s")
      kubectl apply -f - >/dev/null 2>&1 <<YAML
apiVersion: vteam.ambient-code/v1alpha1
kind: AgenticSession
metadata:
  name: $SESSION_NAME
  namespace: $NS_NAME
spec:
  initialPrompt: "oom reproducer session"
  timeout: 60
YAML
      # Set status to Completed via status subresource
      kubectl patch agenticsession "$SESSION_NAME" -n "$NS_NAME" \
        --type merge --subresource status \
        -p '{"status":{"phase":"Completed"}}' >/dev/null 2>&1 || true
      SESSIONS_CREATED=$((SESSIONS_CREATED + 1))
    done

    NS_CREATED=$((NS_CREATED + 1))
  done

  # Let the operator process
  sleep 3

  # Collect metrics
  CURRENT_MEMORY=$(get_memory_usage)
  CURRENT_RESTARTS=$(get_restart_count)
  RESTART_DELTA=$((CURRENT_RESTARTS - BASELINE_RESTARTS))

  printf "  [batch %3d/%d]  namespaces: %4d  |  sessions: %6d  |  memory: %8s  |  restarts: +%d\n" \
    "$batch" "$TOTAL_BATCHES" "$NS_CREATED" "$SESSIONS_CREATED" "$CURRENT_MEMORY" "$RESTART_DELTA"

  # Capture heap profile if requested
  if [[ "$PPROF" == "true" ]]; then
    capture_heap_profile "$batch"
  fi

  # Check for OOMKill
  if is_oomkilled || (( RESTART_DELTA > 0 )); then
    echo ""
    echo "=== OOMKill Detected ==="
    echo "  The operator was OOMKilled after:"
    echo "    Namespaces:  $NS_CREATED"
    echo "    Sessions:    $SESSIONS_CREATED"
    echo "    Memory:      $CURRENT_MEMORY (limit: $MEM_LIMIT)"
    echo "    Restarts:    +$RESTART_DELTA (total: $CURRENT_RESTARTS)"
    echo ""
    echo "  Termination details:"
    kubectl get pods -n "$OPERATOR_NS" -l app=agentic-operator \
      -o jsonpath='{.items[0].status.containerStatuses[0].lastState.terminated}' 2>/dev/null || true
    if [[ "$PPROF" == "true" && -n "$PPROF_RUN_DIR" ]]; then
      echo ""
      echo "  Heap profiles: $PPROF_RUN_DIR/"
      echo "  Analyze with:  go tool pprof $PPROF_RUN_DIR/heap-batch-*.pb.gz"
    fi
    echo ""
    OOMKILLED=true
    break
  fi
done

if [[ "$OOMKILLED" == "false" ]]; then
  echo ""
  echo "=== No OOMKill Detected ==="
  echo "  All $NAMESPACES namespaces and $TOTAL_SESSIONS sessions created without OOMKill."
  echo "  Current memory: $(get_memory_usage) (limit: $MEM_LIMIT)"
  echo ""
  echo "  To trigger OOM, try:"
  echo "    --mem-limit 64Mi        (lower the limit)"
  echo "    --namespaces 1000       (more namespaces)"
  echo "    --sessions-per-ns 10    (more sessions per namespace)"
fi

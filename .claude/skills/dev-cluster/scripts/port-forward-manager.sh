#!/usr/bin/env bash
# Port-forward manager for Ambient Code Platform dev clusters.
# Handles preflight validation, clean startup, health checks, and teardown.
#
# Usage:
#   port-forward-manager.sh preflight            # Validate ports and kill zombies
#   port-forward-manager.sh start [services...]   # Start port-forwards (default: all)
#   port-forward-manager.sh stop                  # Stop all port-forwards
#   port-forward-manager.sh status                # Check health of port-forwards
#   port-forward-manager.sh restart [services...]  # Stop + preflight + start
#
# Services: backend, public-api, frontend
# Default: backend public-api (frontend uses NodePort on kind)

set -euo pipefail

PID_DIR="/tmp/ambient-code/port-forward"
NAMESPACE="${NAMESPACE:-ambient-code}"
LOCK="${PID_DIR}/.lock"

# Service definitions: name -> local_port:svc_name:svc_port
declare -A SERVICES=(
  [backend]="8081:backend-service:8080"
  [public-api]="8082:public-api-service:8081"
  [frontend]="8080:frontend-service:3000"
)

DEFAULT_SERVICES=(backend public-api)

# --- helpers ---

log()  { echo "  $*"; }
ok()   { echo "  ✓ $*"; }
warn() { echo "  ⚠ $*" >&2; }
fail() { echo "  ✗ $*" >&2; exit 1; }

acquire_lock() {
  mkdir -p "$PID_DIR"
  if ! mkdir "$LOCK" 2>/dev/null; then
    # Stale lock? Check if holder is alive.
    local holder
    holder=$(cat "$LOCK/pid" 2>/dev/null || echo "")
    if [ -n "$holder" ] && kill -0 "$holder" 2>/dev/null; then
      fail "Another port-forward-manager is running (PID $holder)"
    fi
    rm -rf "$LOCK"
    mkdir "$LOCK"
  fi
  echo $$ > "$LOCK/pid"
  trap 'rm -rf "$LOCK"' EXIT
}

port_owner() {
  # Returns the PID using a port, or empty string.
  local port=$1
  lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null | head -1 || true
}

is_our_process() {
  # Check if a PID is one of our managed port-forwards.
  local pid=$1
  local cmd
  cmd=$(ps -p "$pid" -o command= 2>/dev/null || true)
  [[ "$cmd" == *"kubectl port-forward"*"$NAMESPACE"* ]]
}

pid_file() { echo "$PID_DIR/$1.pid"; }

read_pid() {
  local f
  f=$(pid_file "$1")
  [ -f "$f" ] && cat "$f" || true
}

is_alive() {
  local pid=$1
  [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null
}

# --- commands ---

cmd_preflight() {
  echo "Port-forward preflight check"

  # 1. Kill any zombie kubectl port-forward processes for our namespace
  local zombies
  zombies=$(pgrep -f "kubectl port-forward.*${NAMESPACE}" 2>/dev/null || true)
  if [ -n "$zombies" ]; then
    local count
    count=$(echo "$zombies" | wc -l | tr -d ' ')
    log "Found $count existing port-forward process(es), cleaning up..."
    echo "$zombies" | while read -r pid; do
      local cmd
      cmd=$(ps -p "$pid" -o command= 2>/dev/null || true)
      kill "$pid" 2>/dev/null && log "Killed PID $pid: $cmd" || true
    done
    sleep 0.5
  fi

  # 2. Clean stale PID files
  rm -f "$PID_DIR"/*.pid 2>/dev/null || true

  # 3. Check target ports are free
  local services=("${@:-${DEFAULT_SERVICES[@]}}")
  local blocked=0
  for svc in "${services[@]}"; do
    local spec="${SERVICES[$svc]:-}"
    [ -z "$spec" ] && { warn "Unknown service: $svc"; continue; }
    local port="${spec%%:*}"
    local owner
    owner=$(port_owner "$port")
    if [ -n "$owner" ]; then
      local cmd
      cmd=$(ps -p "$owner" -o command= 2>/dev/null || echo "unknown")
      warn "Port $port is in use by PID $owner ($cmd)"
      blocked=1
    else
      ok "Port $port is free ($svc)"
    fi
  done

  # 4. Verify cluster is reachable
  if ! kubectl cluster-info >/dev/null 2>&1; then
    fail "Cluster is not reachable (kubectl cluster-info failed)"
  fi
  ok "Cluster is reachable"

  # 5. Verify namespace exists
  if ! kubectl get namespace "$NAMESPACE" >/dev/null 2>&1; then
    fail "Namespace '$NAMESPACE' does not exist"
  fi
  ok "Namespace '$NAMESPACE' exists"

  if [ "$blocked" -eq 1 ]; then
    fail "One or more ports are in use. Free them before starting port-forwards."
  fi

  ok "Preflight passed"
}

cmd_start() {
  local services=("${@:-${DEFAULT_SERVICES[@]}}")

  acquire_lock

  echo "Starting port-forwards"

  mkdir -p "$PID_DIR"

  for svc in "${services[@]}"; do
    local spec="${SERVICES[$svc]:-}"
    [ -z "$spec" ] && { warn "Unknown service: $svc, skipping"; continue; }

    local port="${spec%%:*}"
    local rest="${spec#*:}"
    local svc_name="${rest%%:*}"
    local svc_port="${rest#*:}"

    # Skip if already running and healthy
    local existing_pid
    existing_pid=$(read_pid "$svc")
    if is_alive "$existing_pid"; then
      ok "$svc already running (PID $existing_pid, localhost:$port)"
      continue
    fi

    # Wait for service endpoint to exist
    if ! kubectl get svc "$svc_name" -n "$NAMESPACE" >/dev/null 2>&1; then
      warn "Service $svc_name not found in $NAMESPACE, skipping $svc"
      continue
    fi

    # Start the port-forward
    kubectl port-forward -n "$NAMESPACE" "svc/$svc_name" "$port:$svc_port" \
      >"$PID_DIR/$svc.log" 2>&1 &
    local pid=$!
    echo "$pid" > "$(pid_file "$svc")"

    # Verify it started (give it a moment to bind or fail)
    sleep 0.5
    if is_alive "$pid"; then
      ok "$svc → localhost:$port (PID $pid)"
    else
      warn "$svc failed to start. Check $PID_DIR/$svc.log"
      cat "$PID_DIR/$svc.log" 2>/dev/null | tail -3 | while read -r line; do
        log "  $line"
      done
    fi
  done
}

cmd_stop() {
  echo "Stopping port-forwards"

  # 1. Kill tracked processes
  for svc in "${!SERVICES[@]}"; do
    local pid
    pid=$(read_pid "$svc")
    if is_alive "$pid"; then
      kill "$pid" 2>/dev/null && ok "Stopped $svc (PID $pid)" || true
    fi
  done

  # 2. Kill any untracked kubectl port-forward for our namespace (zombies)
  local zombies
  zombies=$(pgrep -f "kubectl port-forward.*${NAMESPACE}" 2>/dev/null || true)
  if [ -n "$zombies" ]; then
    echo "$zombies" | while read -r pid; do
      kill "$pid" 2>/dev/null && log "Killed untracked PID $pid" || true
    done
  fi

  # 3. Clean up state
  rm -f "$PID_DIR"/*.pid "$PID_DIR"/*.log 2>/dev/null || true
  ok "All port-forwards stopped"
}

cmd_status() {
  echo "Port-forward status"

  local any_running=0
  for svc in "${!SERVICES[@]}"; do
    local spec="${SERVICES[$svc]}"
    local port="${spec%%:*}"
    local pid
    pid=$(read_pid "$svc")

    if is_alive "$pid"; then
      # Verify the port is actually accepting connections (any HTTP response = healthy)
      local http_code
      http_code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 2 "http://localhost:$port" 2>/dev/null || echo "000")
      if [ "$http_code" != "000" ]; then
        ok "$svc: healthy (PID $pid, localhost:$port, HTTP $http_code)"
      else
        warn "$svc: running but not responding (PID $pid, localhost:$port)"
      fi
      any_running=1
    else
      local port_pid
      port_pid=$(port_owner "$port")
      if [ -n "$port_pid" ]; then
        warn "$svc: not managed but port $port in use by PID $port_pid"
      else
        log "$svc: not running (port $port free)"
      fi
    fi
  done

  # Check for untracked port-forwards
  local untracked
  untracked=$(pgrep -f "kubectl port-forward.*${NAMESPACE}" 2>/dev/null || true)
  if [ -n "$untracked" ]; then
    local tracked_pids=""
    for svc in "${!SERVICES[@]}"; do
      local p
      p=$(read_pid "$svc")
      [ -n "$p" ] && tracked_pids="$tracked_pids $p"
    done
    echo "$untracked" | while read -r pid; do
      if ! echo "$tracked_pids" | grep -qw "$pid"; then
        local cmd
        cmd=$(ps -p "$pid" -o command= 2>/dev/null || echo "unknown")
        warn "Untracked port-forward: PID $pid ($cmd)"
      fi
    done
  fi

  return 0
}

cmd_restart() {
  cmd_stop
  echo ""
  cmd_preflight "$@"
  echo ""
  cmd_start "$@"
}

# --- main ---

case "${1:-}" in
  preflight) shift; cmd_preflight "$@" ;;
  start)     shift; cmd_start "$@" ;;
  stop)      cmd_stop ;;
  status)    cmd_status ;;
  restart)   shift; cmd_restart "$@" ;;
  *)
    echo "Usage: $0 {preflight|start|stop|status|restart} [services...]"
    echo "Services: ${!SERVICES[*]}"
    echo "Default:  ${DEFAULT_SERVICES[*]}"
    exit 1
    ;;
esac

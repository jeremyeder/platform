---
name: dev-cluster
description: Manages Ambient Code Platform development clusters (kind/minikube) for testing changes. Handles cluster lifecycle, image builds, port forwarding with zombie cleanup, and deployment verification.
---

# Development Cluster Management

Manage local Kubernetes clusters for testing Ambient Code Platform changes.

## Components

| Component | Location | Image | Deployment |
|-----------|----------|-------|------------|
| Backend | `components/backend` | `vteam_backend:latest` | `backend-api` |
| Frontend | `components/frontend` | `vteam_frontend:latest` | `frontend` |
| Operator | `components/operator` | `vteam_operator:latest` | `agentic-operator` |
| Runner | `components/runners/ambient-runner` | `vteam_claude_runner:latest` | (Job pods) |
| State Sync | `components/runners/state-sync` | `vteam_state_sync:latest` | (Job pods) |
| Public API | `components/public-api` | `vteam_public_api:latest` | `public-api` |

## Port Forwarding Management

Port forwarding is the #1 source of dev-cluster pain. **Always use the manager script** — never run `kubectl port-forward` directly.

### The Script

Located at: `scripts/port-forward-manager.sh` (relative to this skill directory)

```bash
SCRIPT=".claude/skills/dev-cluster/scripts/port-forward-manager.sh"
```

### Standard Port Assignments

| Service | Local Port | Cluster Service | Used By |
|---------|-----------|-----------------|---------|
| backend | 8081 | backend-service:8080 | MCP servers, API testing |
| public-api | 8082 | public-api-service:8081 | mcp-acp, external clients |
| frontend | 8080 | frontend-service:3000 | Browser (optional — NodePort often sufficient) |

**Kind with Docker**: Frontend is accessible at `http://localhost` via NodePort (30080→80). No port-forward needed for frontend. Only forward backend and public-api.

**Kind with Podman**: Frontend at `http://localhost:8080` via NodePort. Forward backend and public-api.

### Mandatory Procedures

#### Before Starting Port Forwards

**Always** run preflight first. This kills zombie processes and validates ports:

```bash
$SCRIPT preflight              # Check default services (backend, public-api)
$SCRIPT preflight frontend     # Also include frontend
```

Preflight does:
1. Finds and kills ALL `kubectl port-forward` processes for the `ambient-code` namespace
2. Removes stale PID files from `/tmp/ambient-code/port-forward/`
3. Checks each target port with `lsof` — fails if a non-kubectl process holds a port
4. Validates cluster reachability and namespace existence

#### Starting Port Forwards

```bash
$SCRIPT start                  # Start backend + public-api (default)
$SCRIPT start frontend         # Start just frontend
$SCRIPT start backend public-api frontend  # Start all three
```

#### Checking Health

```bash
$SCRIPT status                 # Shows PID, port, and HTTP health for each service
```

#### Stopping

```bash
$SCRIPT stop                   # Kills tracked processes + any untracked zombies
```

#### Full Restart (Stop + Preflight + Start)

```bash
$SCRIPT restart                # Restart default services
$SCRIPT restart backend public-api frontend  # Restart all
```

### When to Run Port Forwarding Operations

| Event | Action |
|-------|--------|
| After `make kind-up` | `$SCRIPT preflight && $SCRIPT start` |
| After `make kind-down` | `$SCRIPT stop` (also kills zombies from dead cluster) |
| After reloading a component | `$SCRIPT restart <component>` |
| Before building/deploying | `$SCRIPT status` (informational) |
| User reports "connection refused" | `$SCRIPT restart` |
| Starting a new session | `$SCRIPT status` then `$SCRIPT restart` if unhealthy |

### Never Do This

- `kubectl port-forward ... &` — creates untracked zombies
- `make kind-port-forward` — launches untracked background processes with `wait`
- `pkill -f "kubectl port-forward"` — use `$SCRIPT stop` instead (it also cleans PID files)
- Assume ports are free without checking

## Cluster Lifecycle

### Kind (Recommended)

```bash
make kind-up      # Create cluster + deploy (Quay.io images)
make kind-down    # Destroy cluster
```

Kind with Docker maps NodePort 30080 to host port 80 (frontend accessible at http://localhost).

### Minikube

```bash
make local-up       # Create + build + deploy
make local-down     # Stop (keep cluster)
make local-clean    # Destroy cluster
make local-rebuild  # Rebuild all + restart
make local-reload-backend   # Rebuild/reload one component
make local-reload-frontend
make local-reload-operator
```

## Workflow: Testing a PR in Kind

### Step 1: Get PR and Checkout

```bash
gh pr view <NUMBER> --json title,headRefName,files,state,body
gh pr checkout <NUMBER>
```

### Step 2: Determine Affected Components

Map changed files to components:
- `components/backend/` → backend
- `components/frontend/` → frontend
- `components/operator/` → operator
- `components/runners/ambient-runner/` → runner
- `components/runners/state-sync/` → state-sync
- `components/public-api/` → public-api

### Step 3: Detect Container Engine

```bash
if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    CONTAINER_ENGINE=docker
elif command -v podman &>/dev/null && podman info &>/dev/null 2>&1; then
    CONTAINER_ENGINE=podman
fi
```

Always pass `CONTAINER_ENGINE=` to make commands.

### Step 4: Create Cluster (if needed)

```bash
make kind-up CONTAINER_ENGINE=$CONTAINER_ENGINE
```

### Step 5: Build Changed Components

```bash
make build-backend CONTAINER_ENGINE=$CONTAINER_ENGINE
make build-public-api CONTAINER_ENGINE=$CONTAINER_ENGINE
# etc. — only build what changed
```

### Step 6: Load and Deploy

```bash
# Load images into kind
kind load docker-image vteam_backend:latest --name ambient-local
kind load docker-image vteam_public_api:latest --name ambient-local

# Update deployments
kubectl set image deployment/backend-api backend-api=vteam_backend:latest -n ambient-code
kubectl patch deployment backend-api -n ambient-code \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"backend-api","imagePullPolicy":"Never"}]}}}}'

kubectl set image deployment/public-api public-api=vteam_public_api:latest -n ambient-code
kubectl patch deployment public-api -n ambient-code \
  -p '{"spec":{"template":{"spec":{"containers":[{"name":"public-api","imagePullPolicy":"Never"}]}}}}'

# Wait for rollout
kubectl rollout status deployment/backend-api -n ambient-code
kubectl rollout status deployment/public-api -n ambient-code
```

### Step 7: Setup Port Forwarding

```bash
$SCRIPT preflight && $SCRIPT start
```

### Step 8: Verify and Report

```bash
kubectl get pods -n ambient-code
$SCRIPT status
```

Detect the frontend URL:
```bash
docker ps --filter "name=ambient-local" --format "{{.Ports}}"
# 0.0.0.0:80->30080/tcp → http://localhost
```

Report to user:
- Frontend URL (from port mapping)
- Backend: http://localhost:8081
- Public API: http://localhost:8082
- Test token: `kubectl get secret test-user-token -n ambient-code -o jsonpath='{.data.token}' | base64 -d`

## Fast Inner-Loop: Frontend Dev Server

For frontend-only changes, skip image rebuilds:

```bash
# Port-forward backend
$SCRIPT preflight && $SCRIPT start backend

# Run NextJS locally
cd components/frontend
npm install
TOKEN=$(kubectl get secret test-user-token -n ambient-code -o jsonpath='{.data.token}' | base64 -d)
cat > .env.local <<EOF
OC_TOKEN=$TOKEN
BACKEND_URL=http://localhost:8081/api
EOF
npm run dev    # http://localhost:3000
```

## Troubleshooting

### ImagePullBackOff
Build locally, load into kind, set `imagePullPolicy: Never`.

### CrashLoopBackOff
```bash
kubectl logs -l app=backend-api -n ambient-code --tail=100
kubectl describe pod -l app=backend-api -n ambient-code
```

### Port Forwarding Not Working
```bash
$SCRIPT status    # Diagnose
$SCRIPT restart   # Fix
```

### Changes Not Reflected
```bash
make build-backend CONTAINER_ENGINE=$CONTAINER_ENGINE
kind load docker-image vteam_backend:latest --name ambient-local
kubectl rollout restart deployment/backend-api -n ambient-code
kubectl rollout status deployment/backend-api -n ambient-code
```

# Demo Quickstart: Continuous Learning on Dev Cluster

## Cluster Access

| Service | URL |
|---------|-----|
| **Frontend** | http://localhost:9017 |
| **Backend API** | NodePort via `kubectl port-forward svc/backend-service 8080:8080 -n ambient-code` |
| **Unleash Admin** | `kubectl port-forward svc/unleash 4242:4242 -n ambient-code` → http://localhost:4242 |

**Kubectl context**: `kind-ambient-001-continuous-learn`

## Step 1: Enable the Feature Flag

The `continuous-learning.enabled` flag is already synced to Unleash (verified in backend logs). To enable it for a workspace:

### Option A: Via Frontend UI
1. Open http://localhost:9017
2. Navigate to a workspace's Settings page
3. Find "continuous-learning.enabled" in the Feature Flags section
4. Toggle it ON

### Option B: Via Unleash Admin API
```bash
# Port-forward Unleash
kubectl port-forward svc/unleash 4242:4242 -n ambient-code &

# Enable the flag globally (100% rollout)
curl -X POST http://localhost:4242/api/admin/projects/default/features/continuous-learning.enabled/environments/development/strategies \
  -H "Authorization: *:*.unleash-admin-token" \
  -H "Content-Type: application/json" \
  -d '{"name": "flexibleRollout", "parameters": {"rollout": "100", "stickiness": "default", "groupId": "continuous-learning.enabled"}}'
```

### Option C: Via ConfigMap Override (per-workspace)
```bash
# Set override for a specific workspace namespace
kubectl patch configmap feature-flag-overrides -n <workspace-namespace> \
  --type merge -p '{"data": {"continuous-learning.enabled": "true"}}'
```

## Step 2: Prepare a Test Repo

Create a repo with `.ambient/config.json`:

```bash
# Create a test repo (or use the example repo)
mkdir -p /tmp/cl-test-repo/.ambient
echo '{"learning": {"enabled": true}}' > /tmp/cl-test-repo/.ambient/config.json
cd /tmp/cl-test-repo
git init && git add -A && git commit -m "init"
```

Or clone the example repo (once the example-repo-agent completes):
```bash
gh repo clone jeremyeder/continuous-learning-example
```

## Step 3: Start a Session

Create a new ACP session in the workspace, pointing at the test repo. The runner will:
1. Clone the repo
2. Read `.ambient/config.json` → find `learning.enabled: true`
3. Check `CONTINUOUS_LEARNING_ENABLED` env var (or call backend API)
4. If both gates pass: inject CL instructions into system prompt

## Step 4: Demo Correction Capture

In the session:
1. Ask Claude to do something (e.g., "Create a Python function that uses f-strings for logging")
2. Correct Claude: "No, use the logging module's % formatting instead of f-strings"
3. Claude silently:
   - Creates branch `learned/correction-2026-04-08-use-logging-format`
   - Writes `docs/learned/corrections/2026-04-08-use-logging-format.md`
   - Creates draft PR with `continuous-learning` label
4. Check the repo: `gh pr list --draft --label continuous-learning`

## Step 5: Demo Explicit Capture

In the session:
1. Say: "save this to learned: always use structured logging with key-value pairs instead of string interpolation"
2. Claude silently creates a draft PR with the pattern
3. Claude acknowledges: "Saved to learned knowledge."

## Step 6: Demo Wiki Injection (if wiki exists)

If the repo has `docs/wiki/INDEX.md`:
1. Start a new session
2. The system prompt includes wiki context instructions
3. Claude reads the wiki INDEX first, then uses coverage indicators to decide what to read

## Step 7: Demo Triage Dashboard (separate)

The triage dashboard changes are on branch `feat/learned-knowledge-section` in `~/repos/dashboards/triage/`:

```bash
cd ~/repos/dashboards/triage
git checkout feat/learned-knowledge-section
npm run dev
```

Open http://localhost:3000, enter a GitHub PAT and repo. The "Learned Knowledge" section shows:
- All draft PRs with `continuous-learning` label
- Inline markdown content preview
- Merge (keep), Close (discard), Skip actions

## Verifying the Implementation

### Check CL instructions in system prompt
```bash
# In the runner logs, look for "Continuous learning enabled"
kubectl logs -n <session-namespace> <runner-pod> | grep -i "continuous learning"
```

### Check flag evaluation
```bash
# Port-forward backend
kubectl port-forward svc/backend-service 8080:8080 -n ambient-code &

# Evaluate the flag
curl -s http://localhost:8080/api/projects/<project>/feature-flags/evaluate/continuous-learning.enabled \
  -H "Authorization: Bearer <token>"
```

### Check Unleash flag state
```bash
kubectl port-forward svc/unleash 4242:4242 -n ambient-code &
curl -s http://localhost:4242/api/admin/features/continuous-learning.enabled \
  -H "Authorization: *:*.unleash-admin-token" | jq .enabled
```

## What's Running

| Component | Status | What Changed |
|-----------|--------|-------------|
| Runner | CL prompt injection, config reading, wiki injection | `prompts.py`, `config.py`, `bridge.py` |
| Backend | Flag synced to Unleash | `flags.json` |
| Frontend | Flag visible in workspace settings | No code changes (uses existing `useWorkspaceFlag`) |
| Triage Dashboard | "Learned Knowledge" section | Separate repo, `~/repos/dashboards/triage/` |
| Example Repo | Full CL demo repo | `jeremyeder/continuous-learning-example` |

## Files Modified in Platform Repo

```
components/manifests/base/core/flags.json              # Added continuous-learning.enabled flag
components/runners/ambient-runner/ambient_runner/
  platform/config.py                                    # Added load_repo_config, evaluate_workspace_flag, is_continuous_learning_enabled
  platform/prompts.py                                   # Added CL prompt constants, builders, wiki injection
  bridges/claude/bridge.py                              # CL config wired into _setup_platform
  bridges/claude/prompts.py                             # build_sdk_system_prompt accepts cl_config
tests/
  test_config.py                                        # 17 tests for config functions
  test_prompts.py                                       # 18 tests for prompt functions
```

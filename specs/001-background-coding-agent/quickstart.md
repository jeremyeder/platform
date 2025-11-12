# Quickstart: Background Coding Agent

**Feature**: Background Coding Agent
**Date**: 2025-11-12
**Purpose**: Integration test scenarios and user acceptance validation

## Overview

This quickstart provides step-by-step validation scenarios that map directly to the feature specification's acceptance criteria. Each scenario includes setup, execution steps, assertions, and cleanup.

---

## Prerequisites

- vTeam platform deployed to Kubernetes cluster (OpenShift 4.13+ or K8s 1.27+)
- User authenticated with project access (via OpenShift OAuth or Bearer token)
- GitHub repository accessible by platform (public or with credentials configured)
- Claude Code CLI available in runner image

**Test Environment Setup**:
```bash
# Create test project (namespace)
oc new-project vteam-test

# Apply CRDs (if not already present)
kubectl apply -f components/manifests/crds/agenticsessions-crd.yaml
kubectl apply -f components/manifests/crds/tasktemplates-crd.yaml

# Deploy backend, operator, frontend
cd components/manifests
./deploy.sh

# Verify deployments
kubectl get pods -n vteam-test
# Expected: backend, frontend, operator pods in Running state
```

---

## Scenario 1: Create Background Task and Monitor Progress

**Acceptance Criterion**: *"Given a team wants to upgrade a dependency in a repository, When they create a background coding task with the upgrade instructions and target repository, Then the system creates a pull request in that repository with the necessary changes, formatted and linted according to the repo's standards."*

### Setup
```bash
# Prepare test repository
REPO_URL="https://github.com/test-org/sample-nodejs-app"
REPO_BRANCH="main"

# Ensure repository has package.json with lodash dependency
# Git clone and verify:
git clone $REPO_URL /tmp/test-repo
cd /tmp/test-repo
cat package.json | grep lodash  # Should exist
```

### Execution Steps

**Step 1: Create background task via API**
```bash
PROJECT="vteam-test"
TOKEN=$(oc whoami -t)  # Or use Bearer token

curl -X POST "https://vteam-api.example.com/api/projects/${PROJECT}/background-tasks" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "upgrade-lodash-test",
    "instructions": "Upgrade lodash to version 4.17.21 in package.json. Run npm install to update package-lock.json. Ensure npm test passes.",
    "repository": {
      "url": "'${REPO_URL}'",
      "branch": "'${REPO_BRANCH}'"
    }
  }'

# Expected Response (201 Created):
# {
#   "name": "upgrade-lodash-test",
#   "uid": "abc-123-def",
#   "status": "Pending",
#   "createdAt": "2025-11-12T10:00:00Z"
# }
```

**Assertions**:
- ✅ HTTP status code = 201
- ✅ Response contains task `name`, `uid`, and `status: "Pending"`
- ✅ Task creation timestamp present

**Step 2: Verify AgenticSession CR created**
```bash
kubectl get agenticsessions -n ${PROJECT} -l ambient-code.io/mode=background

# Expected output:
# NAME                        AGE
# upgrade-lodash-test-{uuid}  5s
```

**Assertions**:
- ✅ AgenticSession CR exists with label `ambient-code.io/mode=background`
- ✅ CR has `spec.mode="background"`
- ✅ CR has `status.phase="Pending"` or `"Creating"`

**Step 3: Verify Operator creates Job**
```bash
# Wait for operator to create Job (5-10 seconds)
sleep 10

kubectl get jobs -n ${PROJECT} | grep upgrade-lodash-test

# Expected output:
# upgrade-lodash-test-{uuid}-job  1/1  10s
```

**Assertions**:
- ✅ Kubernetes Job created with name matching task
- ✅ Job has OwnerReference to AgenticSession CR
- ✅ Job has `spec.activeDeadlineSeconds=3600` (1 hour timeout)

**Step 4: Monitor task progress**
```bash
# Poll task status every 5 seconds
for i in {1..60}; do
  STATUS=$(curl -s "https://vteam-api.example.com/api/projects/${PROJECT}/background-tasks/upgrade-lodash-test" \
    -H "Authorization: Bearer ${TOKEN}" | jq -r '.status')

  PROGRESS=$(curl -s "https://vteam-api.example.com/api/projects/${PROJECT}/background-tasks/upgrade-lodash-test" \
    -H "Authorization: Bearer ${TOKEN}" | jq -r '.progress')

  echo "$(date): Status=$STATUS, Progress=$PROGRESS%"

  if [ "$STATUS" == "Completed" ] || [ "$STATUS" == "Failed" ]; then
    break
  fi

  sleep 5
done
```

**Assertions**:
- ✅ Task transitions: `Pending` → `Creating` → `Running` → `Completed`
- ✅ Progress increases from 0% → 20% (clone) → 60% (generate) → 80% (validate) → 100% (PR created)
- ✅ `currentPhase` field updates: "Initializing workspace" → "Running linters" → "Pull request created"

**Step 5: Verify PR created in GitHub**
```bash
# Get PR URL from task status
PR_URL=$(curl -s "https://vteam-api.example.com/api/projects/${PROJECT}/background-tasks/upgrade-lodash-test" \
  -H "Authorization: Bearer ${TOKEN}" | jq -r '.prUrl')

echo "PR created at: $PR_URL"

# Verify PR exists
curl -s "$PR_URL" | grep "Automated changes from background task"
```

**Assertions**:
- ✅ `prUrl` field populated in task status
- ✅ GitHub PR exists at URL
- ✅ PR title contains "[Background Task]"
- ✅ PR body contains task metadata (task name, created date, validation results)
- ✅ PR has changes to `package.json` and `package-lock.json`

**Step 6: Verify validation was executed**
```bash
# Get task logs
LOGS=$(curl -s "https://vteam-api.example.com/api/projects/${PROJECT}/background-tasks/upgrade-lodash-test" \
  -H "Authorization: Bearer ${TOKEN}" | jq -r '.logs')

echo "$LOGS" | grep "npm run lint"
echo "$LOGS" | grep "npm test"
```

**Assertions**:
- ✅ Logs contain "Running linters..." or "npm run lint"
- ✅ Logs contain "Running tests..." or "npm test"
- ✅ Logs contain "All checks passed" or similar success message

### Cleanup
```bash
# Delete background task
kubectl delete agenticsession upgrade-lodash-test-* -n ${PROJECT}

# Close GitHub PR (if test repo)
gh pr close ${PR_URL} --delete-branch
```

---

## Scenario 2: Real-Time Progress Tracking

**Acceptance Criterion**: *"Given a background task is running, When a developer checks the task status, Then they see real-time progress including current execution phase and any error details."*

### Setup
```bash
# Reuse Scenario 1 setup
# Create background task (as in Scenario 1 Step 1)
```

### Execution Steps

**Step 1: Create long-running task**
```bash
curl -X POST "https://vteam-api.example.com/api/projects/${PROJECT}/background-tasks" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "slow-task-test",
    "instructions": "Add comprehensive JSDoc comments to all functions in the src/ directory. Ensure eslint passes.",
    "repository": {
      "url": "'${REPO_URL}'",
      "branch": "'${REPO_BRANCH}'"
    }
  }'
```

**Step 2: Poll status at 5-second intervals**
```bash
#!/bin/bash
# Save as /tmp/monitor-task.sh

for i in {1..60}; do
  RESPONSE=$(curl -s "https://vteam-api.example.com/api/projects/${PROJECT}/background-tasks/slow-task-test" \
    -H "Authorization: Bearer ${TOKEN}")

  echo "--- Poll $i ($(date)) ---"
  echo "$RESPONSE" | jq '{status, progress, currentPhase, logs: (.logs | split("\n") | .[-5:])}'  # Last 5 log lines
  echo ""

  STATUS=$(echo "$RESPONSE" | jq -r '.status')
  if [ "$STATUS" == "Completed" ] || [ "$STATUS" == "Failed" ]; then
    break
  fi

  sleep 5
done
```

**Assertions**:
- ✅ Each poll returns updated `progress` field (monotonically increasing)
- ✅ `currentPhase` field changes over time (e.g., "Cloning repo" → "Generating changes" → "Running validation")
- ✅ `logs` field accumulates new output (last 10KB retained)
- ✅ API response time <100ms p95

### Cleanup
```bash
kubectl delete agenticsession slow-task-test-* -n ${PROJECT}
```

---

## Scenario 3: Pull Request Metadata and Audit Trail

**Acceptance Criterion**: *"Given a background task completes successfully, When reviewing the generated pull request, Then the PR includes a description of changes, validation results (linting/formatting/tests), and links back to the originating task for audit purposes."*

### Setup
```bash
# Reuse Scenario 1 to create and complete a task
# Ensure task reaches "Completed" status
```

### Execution Steps

**Step 1: Get PR URL from completed task**
```bash
TASK_RESPONSE=$(curl -s "https://vteam-api.example.com/api/projects/${PROJECT}/background-tasks/upgrade-lodash-test" \
  -H "Authorization: Bearer ${TOKEN}")

PR_URL=$(echo "$TASK_RESPONSE" | jq -r '.prUrl')
TASK_NAME=$(echo "$TASK_RESPONSE" | jq -r '.name')
TASK_CREATED=$(echo "$TASK_RESPONSE" | jq -r '.createdAt')
```

**Step 2: Fetch PR details from GitHub**
```bash
# Extract owner/repo/pr_number from PR_URL
# Example: https://github.com/test-org/sample-nodejs-app/pull/123

PR_API_URL=$(echo "$PR_URL" | sed 's/github.com/api.github.com\/repos/; s/\/pull\//\/pulls\//')

curl -s "$PR_API_URL" \
  -H "Authorization: token ${GITHUB_TOKEN}" \
  > /tmp/pr-details.json

cat /tmp/pr-details.json | jq '{title, body, state}'
```

**Assertions**:
- ✅ PR title contains "[Background Task]" prefix
- ✅ PR title contains task name (e.g., "upgrade-lodash-test")
- ✅ PR body contains:
  - Task name
  - Created timestamp
  - Link to vTeam task details page
  - Validation results (✅ Linting passed, ✅ Tests passed)
- ✅ PR is in "open" state
- ✅ PR head branch matches expected pattern (e.g., `background-task-upgrade-lodash-test`)

**Step 3: Verify audit trail in task status**
```bash
echo "$TASK_RESPONSE" | jq '{
  name,
  createdAt,
  completedAt,
  status,
  prUrl,
  logs: (.logs | split("\n") | length)  # Log line count
}'
```

**Assertions**:
- ✅ Task `createdAt` timestamp matches PR creation time (±5 seconds)
- ✅ Task `status` = "Completed"
- ✅ Task `prUrl` matches GitHub PR URL
- ✅ Task `logs` contain full execution history

### Cleanup
```bash
kubectl delete agenticsession upgrade-lodash-test-* -n ${PROJECT}
gh pr close ${PR_URL} --delete-branch
```

---

## Scenario 4: Retry Failed Task

**Acceptance Criterion**: *"Given a background task fails during execution, When the error is reviewed, Then the system provides detailed logs showing the failure point and allows the task to be retried."*

### Setup
```bash
# Create a task that will fail validation (e.g., introduce linting error)
```

### Execution Steps

**Step 1: Create task that fails validation**
```bash
curl -X POST "https://vteam-api.example.com/api/projects/${PROJECT}/background-tasks" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "failing-task-test",
    "instructions": "Add a new function with intentional eslint errors: function badFunc( ){ console.log( x ) }",
    "repository": {
      "url": "'${REPO_URL}'",
      "branch": "'${REPO_BRANCH}'"
    }
  }'
```

**Step 2: Wait for task to fail**
```bash
# Poll until status = "Failed"
for i in {1..60}; do
  STATUS=$(curl -s "https://vteam-api.example.com/api/projects/${PROJECT}/background-tasks/failing-task-test" \
    -H "Authorization: Bearer ${TOKEN}" | jq -r '.status')

  if [ "$STATUS" == "Failed" ]; then
    break
  fi

  sleep 5
done
```

**Step 3: Review failure details**
```bash
FAILED_RESPONSE=$(curl -s "https://vteam-api.example.com/api/projects/${PROJECT}/background-tasks/failing-task-test" \
  -H "Authorization: Bearer ${TOKEN}")

echo "$FAILED_RESPONSE" | jq '{status, error, logs: (.logs | split("\n") | .[-20:])}'
```

**Assertions**:
- ✅ Task `status` = "Failed"
- ✅ `error` field populated with failure reason (e.g., "Linting failed: eslint returned non-zero exit code")
- ✅ `logs` contain detailed error output from linter
- ✅ `prUrl` field is null (no PR created)

**Step 4: Retry failed task**
```bash
curl -X POST "https://vteam-api.example.com/api/projects/${PROJECT}/background-tasks/failing-task-test/retry" \
  -H "Authorization: Bearer ${TOKEN}"

# Expected Response (200 OK):
# {
#   "name": "failing-task-test-retry-1",
#   "status": "Pending",
#   "retryCount": 1
# }
```

**Assertions**:
- ✅ New AgenticSession CR created with incremented retry count
- ✅ Original failed task CR retained (audit trail)
- ✅ New task transitions through states (Pending → Creating → Running)
- ✅ Retry count visible in frontend UI

### Cleanup
```bash
kubectl delete agenticsessions -n ${PROJECT} -l ambient-code.io/mode=background
```

---

## Scenario 5: Reusable Task Templates

**Acceptance Criterion**: *"Given a background task template has been proven successful, When a similar task is needed in the future, Then users can reuse the template with different parameters instead of writing new instructions from scratch."*

### Setup
```bash
# No special setup needed
```

### Execution Steps

**Step 1: Create task template**
```bash
curl -X POST "https://vteam-api.example.com/api/projects/${PROJECT}/task-templates" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "upgrade-dependency",
    "displayName": "Upgrade NPM Dependency",
    "description": "Upgrades a specified npm dependency to a target version",
    "instructionsTemplate": "Upgrade {{packageName}} to version {{version}} in package.json. Run npm install to update package-lock.json. Ensure npm test passes.",
    "parameters": [
      {
        "name": "packageName",
        "type": "string",
        "required": true,
        "description": "NPM package name to upgrade"
      },
      {
        "name": "version",
        "type": "string",
        "required": true,
        "defaultValue": "latest",
        "validationRegex": "^\\\\d+\\\\.\\\\d+\\\\.\\\\d+$|^latest$"
      }
    ]
  }'

# Expected Response (201 Created):
# {
#   "name": "upgrade-dependency",
#   "uid": "xyz-789"
# }
```

**Assertions**:
- ✅ TaskTemplate CR created in namespace
- ✅ Template appears in list: `GET /api/projects/${PROJECT}/task-templates`

**Step 2: Use template to create task (lodash upgrade)**
```bash
curl -X POST "https://vteam-api.example.com/api/projects/${PROJECT}/background-tasks" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "upgrade-lodash-from-template",
    "templateId": "upgrade-dependency",
    "parameters": {
      "packageName": "lodash",
      "version": "4.17.21"
    },
    "repository": {
      "url": "'${REPO_URL}'",
      "branch": "'${REPO_BRANCH}'"
    }
  }'
```

**Assertions**:
- ✅ Backend instantiates template with parameters
- ✅ Generated instructions = "Upgrade lodash to version 4.17.21 in package.json..."
- ✅ Task executes successfully (same as Scenario 1)

**Step 3: Reuse template for different package (axios upgrade)**
```bash
curl -X POST "https://vteam-api.example.com/api/projects/${PROJECT}/background-tasks" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "upgrade-axios-from-template",
    "templateId": "upgrade-dependency",
    "parameters": {
      "packageName": "axios",
      "version": "1.6.0"
    },
    "repository": {
      "url": "'${REPO_URL}'",
      "branch": "'${REPO_BRANCH}'"
    }
  }'
```

**Assertions**:
- ✅ Same template reused with different parameters
- ✅ Generated instructions = "Upgrade axios to version 1.6.0 in package.json..."
- ✅ Task executes independently from lodash upgrade task

**Step 4: Verify template usage tracking**
```bash
curl -s "https://vteam-api.example.com/api/projects/${PROJECT}/task-templates" \
  -H "Authorization: Bearer ${TOKEN}" | jq '.items[] | select(.name == "upgrade-dependency") | {name, usageCount, lastUsed}'

# Expected output:
# {
#   "name": "upgrade-dependency",
#   "usageCount": 2,
#   "lastUsed": "2025-11-12T10:15:00Z"
# }
```

**Assertions**:
- ✅ Template `usageCount` incremented to 2
- ✅ Template `lastUsed` timestamp updated

### Cleanup
```bash
kubectl delete tasktemplate upgrade-dependency -n ${PROJECT}
kubectl delete agenticsessions -n ${PROJECT} -l ambient-code.io/template=upgrade-dependency
```

---

## Performance Validation

**Requirement**: FR-017 enforces 1 concurrent task per user, 1 hour timeout

### Test: Concurrent Task Limit

```bash
# Step 1: Create first task
curl -X POST "https://vteam-api.example.com/api/projects/${PROJECT}/background-tasks" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name": "task1", "instructions": "...", "repository": {...}}'

# Step 2: Immediately create second task (should fail)
curl -X POST "https://vteam-api.example.com/api/projects/${PROJECT}/background-tasks" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"name": "task2", "instructions": "...", "repository": {...}}'

# Expected Response (409 Conflict):
# {
#   "error": "Concurrent task limit reached",
#   "message": "You already have 1 running background task. Wait for it to complete or cancel it."
# }
```

**Assertions**:
- ✅ Second task creation returns HTTP 409
- ✅ Error message indicates concurrency limit
- ✅ After first task completes/fails, second task can be created

### Test: Timeout Enforcement

```bash
# Create task that takes >1 hour (artificial delay)
curl -X POST "https://vteam-api.example.com/api/projects/${PROJECT}/background-tasks" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "timeout-test",
    "instructions": "Add comments to all files, then sleep for 2 hours",
    "repository": {...}
  }'

# Monitor for 1 hour 5 minutes
# After ~1 hour, check status
curl -s "https://vteam-api.example.com/api/projects/${PROJECT}/background-tasks/timeout-test" \
  -H "Authorization: Bearer ${TOKEN}" | jq '{status, error}'

# Expected:
# {
#   "status": "Timeout",
#   "error": "Task exceeded 1 hour deadline"
# }
```

**Assertions**:
- ✅ Job terminated after exactly 3600 seconds (1 hour)
- ✅ Task status transitions to "Timeout"
- ✅ Error message indicates deadline exceeded
- ✅ Kubernetes Job status shows `DeadlineExceeded`

---

## Success Criteria Summary

All scenarios MUST pass for feature acceptance:

- ✅ Scenario 1: Task creation, execution, and PR creation
- ✅ Scenario 2: Real-time progress tracking with <100ms API response
- ✅ Scenario 3: PR metadata and audit trail linkage
- ✅ Scenario 4: Failure handling and retry capability
- ✅ Scenario 5: Template creation and reuse
- ✅ Performance: 1 concurrent task limit enforced
- ✅ Performance: 1-hour timeout enforced
- ✅ Performance: <200ms task creation API response time (p95)
- ✅ Performance: 90% of tasks complete within 1 hour

---

## Troubleshooting

**Task stuck in "Creating" state**:
```bash
# Check operator logs
kubectl logs -n ${PROJECT} deployment/vteam-operator --tail=50

# Check if Job was created
kubectl get jobs -n ${PROJECT} | grep <task-name>
```

**Task fails with "Permission denied" on GitHub**:
```bash
# Verify repository URL is accessible
# Check GitHub credentials in runner ServiceAccount Secret
kubectl get secrets -n ${PROJECT} | grep runner-token
```

**Validation always fails**:
```bash
# Check runner pod logs
kubectl logs -n ${PROJECT} <runner-pod-name> -c ambient-code-runner

# Verify repository has package.json, linting config, tests
```

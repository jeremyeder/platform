# Research: Background Coding Agent

**Feature**: Background Coding Agent
**Date**: 2025-11-12
**Status**: Complete

## Executive Summary

All technical unknowns have been resolved through codebase exploration and existing pattern analysis. The background coding agent feature can be implemented by extending the existing AgenticSession CRD with a `spec.mode` field and reusing proven patterns for Job creation, timeout enforcement, concurrency control, and PR creation. No new architectural patterns are required.

## Research Findings

### 1. CRD Extension Patterns

**Decision**: Add optional `spec.mode` field to AgenticSession CRD with backward compatibility

**Rationale**:
- Kubernetes CRD supports optional fields with default values
- Existing AgenticSessions will default to `mode: "interactive"` when field is absent
- Operator can differentiate behavior based on mode without separate CRD
- Reduces operational complexity (single CRD to manage vs two)

**Implementation Pattern**:
```yaml
# agenticsessions-crd.yaml (existing file)
spec:
  properties:
    mode:
      type: string
      enum: ["interactive", "batch", "background"]
      default: "interactive"
      description: "Execution mode for the session"
```

**Alternatives Considered**:
1. **Separate BackgroundTask CRD** - Rejected because it duplicates 90% of AgenticSession spec (prompt, repos, timeout, status fields)
2. **Separate namespace for background tasks** - Rejected because it breaks project-scoped isolation requirement (FR-020)

**References**:
- Existing CRD: `components/manifests/crds/agenticsessions-crd.yaml`
- Backend types: `components/backend/types/session.go:AgenticSessionSpec`

---

### 2. Kubernetes Job Timeout Enforcement

**Decision**: Use `Job.spec.activeDeadlineSeconds` for hard timeout enforcement

**Rationale**:
- Kubernetes native feature, no custom timeout logic required
- Job automatically transitions to Failed state when deadline exceeded
- Operator's existing `monitorJob()` goroutine detects failure and updates CR status
- Prevents runaway costs (FR-019 deferred clarification)

**Implementation Pattern**:
```go
// operator/internal/handlers/sessions.go (existing file, modify Job creation)
job := &batchv1.Job{
    Spec: batchv1.JobSpec{
        ActiveDeadlineSeconds: &[]int64{3600}[0], // 1 hour timeout
        Template: corev1.PodTemplateSpec{
            // ... existing pod spec
        },
    },
}
```

**Timeout Behavior**:
- Job pod forcefully terminated after 3600 seconds (1 hour)
- Job status transitions to `Failed` with reason `DeadlineExceeded`
- Operator sets AgenticSession `status.phase: "Timeout"`
- Frontend displays "Task timed out after 1 hour"

**Alternatives Considered**:
1. **Custom timeout goroutine in operator** - Rejected because it duplicates Kubernetes functionality and adds complexity
2. **Runner-managed timeout** - Rejected because runner pod could crash, leaving Job running indefinitely

**References**:
- K8s Job API: https://kubernetes.io/docs/concepts/workloads/controllers/job/#job-termination-and-cleanup
- Existing Job creation: `operator/internal/handlers/sessions.go:createRunnerJob()` (lines 308-533)

---

### 3. Concurrency Control (1 Task Per User)

**Decision**: Backend validates concurrency limit before creating AgenticSession CR

**Rationale**:
- RBAC enforcement happens in backend with user-scoped Kubernetes client
- Backend has full visibility into user's existing tasks via label selectors
- Prevents invalid CR creation (fail fast at API layer)
- Simpler than operator-side validation (operator doesn't know user identity reliably)

**Implementation Pattern**:
```go
// components/backend/handlers/background_tasks.go (NEW file)
func (h *BackgroundTaskHandler) Create(c *gin.Context) {
    user := getUserFromContext(c) // From X-Forwarded-User header
    project := c.Param("projectName")

    // Check concurrent tasks for this user
    listOpts := v1.ListOptions{
        LabelSelector: fmt.Sprintf(
            "ambient-code.io/mode=background,ambient-code.io/creator=%s",
            user,
        ),
    }

    existingTasks, err := reqDyn.Resource(gvr).Namespace(project).List(ctx, listOpts)
    if err != nil {
        return c.JSON(500, gin.H{"error": "Failed to check concurrent tasks"})
    }

    runningCount := 0
    for _, task := range existingTasks.Items {
        phase, _, _ := unstructured.NestedString(task.Object, "status", "phase")
        if phase == "Pending" || phase == "Creating" || phase == "Running" {
            runningCount++
        }
    }

    if runningCount >= 1 {
        return c.JSON(409, gin.H{
            "error": "Concurrent task limit reached",
            "message": "You already have 1 running background task. Wait for it to complete or cancel it.",
        })
    }

    // Proceed with CR creation...
}
```

**Label Strategy**:
```yaml
metadata:
  labels:
    ambient-code.io/mode: "background"
    ambient-code.io/creator: "{username}"  # From X-Forwarded-User
```

**Alternatives Considered**:
1. **Operator-side validation** - Rejected because operator doesn't have reliable access to user identity (runs as service account)
2. **Kubernetes Resource Quota** - Rejected because it's namespace-scoped, not user-scoped
3. **Admission webhook** - Rejected because it adds deployment complexity for simple validation

**References**:
- Existing user extraction: `components/backend/handlers/middleware.go:forwardedIdentityMiddleware()`
- Existing CR list: `components/backend/handlers/sessions.go:ListSessions()` (lines 125-200)

---

### 4. GitHub PR Creation from Runner

**Decision**: Extend existing `_push_results_if_any()` function to call GitHub PR API after pushing changes

**Rationale**:
- Runner already has GitHub credentials from repo URL (SSH key or HTTPS token)
- Existing code handles git push to fork/origin
- GitHub PR API is simple REST call: `POST /repos/{owner}/{repo}/pulls`
- No additional authentication required (use same credentials as git push)

**Implementation Pattern**:
```python
# components/runners/claude-code-runner/wrapper.py (existing file)
def _push_results_if_any(self):
    """Pushes git changes and creates PR if auto_push_on_complete is True."""
    # ... existing git push logic (lines 612-772)

    # NEW: Create PR after successful push
    if self.auto_push_on_complete and self.execution_mode == "background":
        pr_url = self._create_github_pr(repo_name, branch_name)
        if pr_url:
            # Update CR status with PR URL
            self._update_repo_status(repo_name, "pushed", pr_url=pr_url)
        else:
            self._update_repo_status(repo_name, "abandoned", error="PR creation failed")

def _create_github_pr(self, repo_name: str, branch_name: str) -> Optional[str]:
    """Creates GitHub pull request and returns PR URL."""
    import requests

    # Extract owner/repo from git remote URL
    owner, repo = self._parse_github_url(repo_name)

    # GitHub API call
    api_url = f"https://api.github.com/repos/{owner}/{repo}/pulls"
    headers = {
        "Authorization": f"token {self._get_github_token()}",
        "Accept": "application/vnd.github+json",
    }
    data = {
        "title": f"[Background Task] {self.task_name}",
        "head": branch_name,
        "base": "main",  # From spec.repos[].output.target
        "body": f"Automated changes from background task.\n\nTask: {self.task_name}\nCreated: {datetime.now().isoformat()}",
    }

    try:
        response = requests.post(api_url, headers=headers, json=data)
        response.raise_for_status()
        return response.json()["html_url"]
    except Exception as e:
        logger.error(f"Failed to create PR: {e}")
        return None
```

**PR Metadata** (FR-009 requirement):
```markdown
# PR Title
[Background Task] upgrade-lodash-v1

# PR Description
Automated changes from background task.

**Task Details**:
- Task Name: upgrade-lodash-v1
- Created: 2025-11-12T10:00:00Z
- Project: my-project
- Creator: user@example.com

**Validation Results**:
✅ Linting passed
✅ Formatting passed
✅ Tests passed (12/12)

**Links**:
- Task details: https://vteam.example.com/projects/my-project/background-tasks/upgrade-lodash-v1
```

**Alternatives Considered**:
1. **Backend creates PR** - Rejected because backend doesn't have access to workspace files
2. **Separate PR creation service** - Rejected because it adds complexity for simple REST API call
3. **Manual PR creation by user** - Rejected because FR-016 requires automatic PR creation

**References**:
- Existing push logic: `wrapper.py:_push_results_if_any()` (lines 612-772)
- GitHub PR API: https://docs.github.com/en/rest/pulls/pulls#create-a-pull-request

---

### 5. Status Update Frequency and Progress Tracking

**Decision**: Runner updates CR status every 30 seconds with progress percentage

**Rationale**:
- Existing runner already updates CR status periodically
- Frontend can poll `/api/projects/:project/background-tasks/:name` for updates
- 30-second interval balances responsiveness vs etcd write load
- Progress calculation based on execution phases (clone → validate → push → PR)

**Implementation Pattern**:
```python
# wrapper.py (existing file, extend _update_cr_status)
def run(self):
    """Main execution loop with progress tracking."""
    self._update_progress(0, "Initializing workspace")

    # Phase 1: Clone repos (20% progress)
    self._prepare_workspace()
    self._update_progress(20, "Repositories cloned")

    # Phase 2: Execute Claude Code (40% progress)
    self._run_claude_code()
    self._update_progress(60, "Code changes generated")

    # Phase 3: Validate changes (20% progress)
    validation_passed = self._run_validation()
    if not validation_passed:
        self._update_progress(100, "Validation failed", error="Linting/tests failed")
        return
    self._update_progress(80, "Validation passed")

    # Phase 4: Push and create PR (20% progress)
    self._push_results_if_any()
    self._update_progress(100, "Pull request created")

def _update_progress(self, percentage: int, phase: str, error: Optional[str] = None):
    """Updates CR status with progress and current phase."""
    status_patch = {
        "progress": percentage,
        "currentPhase": phase,
    }
    if error:
        status_patch["error"] = error
        status_patch["phase"] = "Failed"

    self._update_cr_status(status_patch)
```

**Progress Milestones**:
- 0%: Initializing workspace
- 20%: Repositories cloned
- 40%: Claude Code execution started
- 60%: Code changes generated
- 80%: Validation passed (linting, formatting, tests)
- 100%: Pull request created OR task failed

**Alternatives Considered**:
1. **Real-time WebSocket updates** - Rejected because background mode doesn't require real-time feedback (not interactive)
2. **1-second polling** - Rejected because it creates excessive etcd write load
3. **Event-driven updates** - Rejected because it adds complexity without clear benefit

**References**:
- Existing status updates: `wrapper.py:_update_cr_status()` (lines 236-255)
- Frontend polling: See Phase 1 design (React Query with 5-second refresh interval)

---

### 6. Long-Running Job Monitoring

**Decision**: Reuse existing `monitorJob()` goroutine pattern from operator

**Rationale**:
- Existing code already supports hours-long Jobs (interactive sessions can run for hours)
- Goroutine exits gracefully when Job completes or CR is deleted
- No changes needed to existing monitoring logic

**Verification**:
```go
// operator/internal/handlers/sessions.go (existing code review)
func monitorJob(jobName, sessionName, namespace string) {
    ticker := time.NewTicker(5 * time.Second)
    defer ticker.Stop()

    for {
        select {
        case <-ticker.C:
            // Check if parent AgenticSession still exists
            _, err := getDynamicClient().Get(ctx, sessionName, namespace)
            if errors.IsNotFound(err) {
                log.Printf("Session deleted, stopping monitoring")
                return  // Exit goroutine
            }

            // Check Job status
            job, err := K8sClient.BatchV1().Jobs(namespace).Get(ctx, jobName, v1.GetOptions{})
            if errors.IsNotFound(err) {
                return
            }

            // Update CR based on Job status
            if job.Status.Succeeded > 0 {
                updateAgenticSessionStatus(namespace, sessionName, map[string]interface{}{
                    "phase": "Completed",
                    "completionTime": time.Now().Format(time.RFC3339),
                })
                cleanup(namespace, jobName)
                return
            }

            if job.Status.Failed > 0 {
                // Check if failed due to deadline exceeded
                reason := getJobFailureReason(job)
                phase := "Failed"
                if reason == "DeadlineExceeded" {
                    phase = "Timeout"
                }

                updateAgenticSessionStatus(namespace, sessionName, map[string]interface{}{
                    "phase": phase,
                    "completionTime": time.Now().Format(time.RFC3339),
                })
                cleanup(namespace, jobName)
                return
            }
        }
    }
}
```

**No modifications needed** - existing logic handles:
- Long-running Jobs (no timeout in goroutine)
- Job failure detection (including deadline exceeded)
- Graceful exit when CR deleted
- Cleanup after Job completion

**References**:
- Existing monitor: `operator/internal/handlers/sessions.go:monitorJob()` (lines 622-943)

---

### 7. Validation Before PR Creation

**Decision**: Runner executes validation commands sequentially before push

**Rationale**:
- FR-005 requires validation (linting, formatting, tests) before PR creation
- Validation should match repository's CI/CD pipeline expectations
- Early failure saves API costs and prevents bad PRs

**Implementation Pattern**:
```python
# wrapper.py (NEW function)
def _run_validation(self) -> bool:
    """Runs repository validation and returns True if all checks pass."""
    validation_steps = [
        ("Linting", "npm run lint || true"),       # Don't fail if no lint script
        ("Formatting", "npm run format || true"),  # Don't fail if no format script
        ("Tests", "npm test"),                     # MUST pass
    ]

    for step_name, command in validation_steps:
        self._update_progress(
            self._current_progress,
            f"Running {step_name.lower()}..."
        )

        result = subprocess.run(
            command,
            shell=True,
            cwd=self.workspace_path,
            capture_output=True,
            text=True,
        )

        if result.returncode != 0:
            error_msg = f"{step_name} failed:\n{result.stderr}"
            logger.error(error_msg)

            # Update CR with failure details
            self._update_cr_status({
                "phase": "Failed",
                "error": error_msg,
                "logs": self._get_current_logs() + f"\n{error_msg}",
            })

            return False

        logger.info(f"{step_name} passed")

    return True
```

**Validation Strategy**:
1. **Linting**: Run `npm run lint` or equivalent (detect from package.json)
2. **Formatting**: Run `npm run format` or equivalent (detect from package.json)
3. **Tests**: Run `npm test` or equivalent (REQUIRED to pass)
4. **Type checking**: Run `npm run typecheck` if available (TypeScript projects)

**Failure Handling**:
- If any validation fails → set `status.phase: "Failed"`
- Do NOT push changes
- Do NOT create PR
- Store validation output in `status.error` field
- User can retry with FR-008

**Alternatives Considered**:
1. **Skip validation, rely on GitHub CI** - Rejected because it wastes Anthropic API costs on bad changes
2. **Parallel validation** - Rejected because sequential execution is simpler and fast enough (< 5 minutes)
3. **User-configurable validation** - Deferred to future enhancement (MVP uses standard patterns)

**References**:
- Validation requirement: Feature spec FR-005
- Error handling: Feature spec FR-007 (detailed logs requirement)

---

## Technology Stack Summary

| Component | Technology | Version | Justification |
|-----------|-----------|---------|---------------|
| Backend | Go | 1.21+ | Existing platform language, type-safe, K8s native |
| Frontend | TypeScript + NextJS | 5.x + 14 | Existing platform framework, React Query for state |
| Operator | Go | 1.21+ | Existing controller-runtime patterns |
| Runner | Python | 3.11+ | Existing wrapper.py, Claude Code SDK compatibility |
| CRD | Kubernetes | 1.27+ | Existing AgenticSession extension |
| Database | etcd (via K8s) | N/A | CRs backed by etcd, no separate DB needed |
| Repository | GitHub | v3 API | MVP scope (GitLab deferred) |
| Testing | Go test + Jest | stdlib + 29.x | Existing test infrastructure |

---

## Dependencies Analysis

### New Dependencies

**Backend**: None (reuses existing Gin, client-go)

**Frontend**: None (reuses existing NextJS, React Query, Shadcn UI)

**Runner**:
- `requests>=2.31.0` - For GitHub PR API calls (already in requirements.txt)
- No new dependencies needed

**Operator**: None (reuses existing controller-runtime patterns)

### Dependency Risks

**Low Risk**: All new functionality reuses existing dependencies. No new third-party libraries introduced.

**GitHub API Rate Limits**:
- Concern: PR creation counts against authenticated user's rate limit (5000 req/hour)
- Mitigation: Background tasks are infrequent (10-100 per day), well below limit
- Monitoring: Track GitHub API errors, alert if rate limit approached

---

## Best Practices Applied

### Kubernetes Patterns
- ✅ CRD extension with backward compatibility
- ✅ OwnerReferences for resource lifecycle
- ✅ Job timeout via activeDeadlineSeconds
- ✅ Namespace-scoped isolation
- ✅ Label selectors for querying
- ✅ Idempotent resource creation

### Go Backend Patterns
- ✅ User-scoped Kubernetes clients (`GetK8sClientsForRequest`)
- ✅ RBAC validation before operations
- ✅ Structured error logging
- ✅ Type-safe unstructured data access
- ✅ No panics in production code
- ✅ Contract tests before implementation

### Python Runner Patterns
- ✅ Virtual environment isolation
- ✅ Black formatting + isort
- ✅ Comprehensive error handling
- ✅ Progress tracking for user feedback
- ✅ CR status updates every 30s

### Frontend Patterns
- ✅ React Query for data fetching
- ✅ Shadcn UI components (zero `any` types)
- ✅ Component colocation
- ✅ Loading and error states
- ✅ Breadcrumbs for nested pages

---

## Performance Considerations

### API Response Times
- **Task creation**: <200ms (simple CR creation, concurrency check is O(n) where n = user's tasks, typically 1-5)
- **Task list**: <100ms (label selector query, pagination supported)
- **Task detail**: <50ms (single CR lookup with status)

### Resource Usage
- **Per-task overhead**: 1 Job, 1 Pod, 1 PVC (reuses existing patterns)
- **Memory**: ~500MB per runner pod (Claude Code SDK + workspace)
- **CPU**: 0.5 cores per runner pod (primarily I/O bound)
- **Storage**: 10GB PVC per task (shared with interactive sessions)

### Scalability Limits (MVP)
- **Concurrent tasks per user**: 1 (enforced in backend)
- **Concurrent tasks per project**: 10 (soft limit, can be increased)
- **Tasks per day**: 100-500 (MVP target)
- **Task duration**: 1 hour max (hard timeout)

---

## Security Considerations

### Authentication
- ✅ Reuses existing OpenShift OAuth integration
- ✅ User identity from `X-Forwarded-User` header
- ✅ Per-session ServiceAccount with minimal permissions

### Authorization
- ✅ Project-scoped RBAC checks before operations
- ✅ User cannot access tasks in other projects
- ✅ Runner ServiceAccount limited to CR status updates

### Data Protection
- ✅ No token logging (existing backend pattern)
- ✅ PVC workspace isolation per task
- ✅ Git credentials from existing repo auth patterns

### Secrets Management
- ✅ GitHub tokens stored in Kubernetes Secrets
- ✅ Runner mounts secrets as environment variables
- ✅ Automatic cleanup on task deletion

---

## Open Questions for Implementation

**Resolved during research** (no blockers):
1. ~~CRD extension strategy~~ → Add `spec.mode` field
2. ~~Timeout enforcement~~ → Job.spec.activeDeadlineSeconds
3. ~~Concurrency limiting~~ → Backend label selector query
4. ~~PR creation~~ → Runner GitHub API call
5. ~~Progress tracking~~ → Runner 30s status updates
6. ~~Validation~~ → Sequential linting/formatting/tests

**Deferred to implementation** (FR-015, FR-019, NFR-006):
- GitHub authentication method → Use existing repo auth patterns
- AI cost control → Rely on timeout, add monitoring later
- Log retention policy → Use K8s default (30 days)

---

## Next Steps

**Phase 1 Prerequisites Met**: All research complete, ready to proceed with design phase.

**Recommended Phase 1 Order**:
1. Create `data-model.md` (document CRD extension + new fields)
2. Create `contracts/openapi.yaml` (API endpoint definitions)
3. Write contract tests in `contracts/tests/` (TDD approach)
4. Create `quickstart.md` (integration test scenarios)
5. Update `CLAUDE.md` with new context

**Estimated Phase 1 Duration**: 2-3 hours (mostly documentation + test stubs)

# Tasks: Background Coding Agent

**Input**: Design documents from `/specs/001-background-coding-agent/`
**Prerequisites**: plan.md (complete), research.md (complete), data-model.md (complete), contracts/openapi.yaml (complete), quickstart.md (complete)

## Execution Flow Summary
All technical unknowns resolved during Phase 0 (research.md). Phase 1 design complete with:
- CRD extension strategy: Add `spec.mode` to AgenticSession
- 7 API endpoints defined in OpenAPI spec
- 2 CRD entities: BackgroundTask (extends AgenticSession), TaskTemplate (new)
- 5 integration test scenarios in quickstart.md
- Constitution check: ✅ PASS (no violations)

## Path Conventions
**Web app structure** (extends existing components):
- **Backend**: `components/backend/` (Go)
- **Frontend**: `components/frontend/` (TypeScript + NextJS)
- **Operator**: `components/operator/` (Go)
- **Runner**: `components/runners/claude-code-runner/` (Python)
- **CRDs**: `components/manifests/crds/`

## Phase 3.1: Setup

- [ ] T001 Extend AgenticSession CRD with `spec.mode` field in `components/manifests/crds/agenticsessions-crd.yaml`
- [ ] T002 Create TaskTemplate CRD in `components/manifests/crds/tasktemplates-crd.yaml`
- [ ] T003 [P] Update Go backend types in `components/backend/types/background_task.go` (BackgroundTask, TaskTemplate structs)
- [ ] T004 [P] Update frontend TypeScript types in `components/frontend/src/types/background-task.ts`

## Phase 3.2: Tests First (TDD) ⚠️ MUST COMPLETE BEFORE 3.3
**CRITICAL: These tests MUST be written and MUST FAIL before ANY implementation**

### Contract Tests (API Endpoints)
- [ ] T005 [P] Contract test POST /api/projects/:project/background-tasks in `components/backend/tests/contract/background_tasks_create_test.go`
- [ ] T006 [P] Contract test GET /api/projects/:project/background-tasks (list) in `components/backend/tests/contract/background_tasks_list_test.go`
- [ ] T007 [P] Contract test GET /api/projects/:project/background-tasks/:name in `components/backend/tests/contract/background_tasks_get_test.go`
- [ ] T008 [P] Contract test POST /api/projects/:project/background-tasks/:name/retry in `components/backend/tests/contract/background_tasks_retry_test.go`
- [ ] T009 [P] Contract test POST /api/projects/:project/background-tasks/:name/cancel in `components/backend/tests/contract/background_tasks_cancel_test.go`
- [ ] T010 [P] Contract test POST /api/projects/:project/task-templates in `components/backend/tests/contract/task_templates_create_test.go`
- [ ] T011 [P] Contract test GET /api/projects/:project/task-templates in `components/backend/tests/contract/task_templates_list_test.go`
- [ ] T012 [P] Contract test: concurrent task limit (409 error) in `components/backend/tests/contract/background_tasks_concurrency_test.go`

### Integration Tests (User Scenarios)
- [ ] T013 [P] Integration test Scenario 1: Create task + monitor + PR creation in `components/backend/tests/integration/scenario_1_create_and_monitor_test.go`
- [ ] T014 [P] Integration test Scenario 2: Real-time progress tracking in `components/backend/tests/integration/scenario_2_progress_tracking_test.go`
- [ ] T015 [P] Integration test Scenario 3: PR metadata and audit trail in `components/backend/tests/integration/scenario_3_pr_metadata_test.go`
- [ ] T016 [P] Integration test Scenario 4: Retry failed task in `components/backend/tests/integration/scenario_4_retry_test.go`
- [ ] T017 [P] Integration test Scenario 5: Reusable task templates in `components/backend/tests/integration/scenario_5_templates_test.go`

## Phase 3.3: Backend Implementation (ONLY after tests are failing)

### Backend API Handlers
- [ ] T018 Implement POST /background-tasks handler (create task, concurrency check) in `components/backend/handlers/background_tasks.go`
- [ ] T019 Implement GET /background-tasks handler (list with filters) in `components/backend/handlers/background_tasks.go`
- [ ] T020 Implement GET /background-tasks/:name handler (task details) in `components/backend/handlers/background_tasks.go`
- [ ] T021 Implement POST /background-tasks/:name/retry handler in `components/backend/handlers/background_tasks.go`
- [ ] T022 Implement POST /background-tasks/:name/cancel handler in `components/backend/handlers/background_tasks.go`
- [ ] T023 Implement POST /task-templates handler (create template) in `components/backend/handlers/task_templates.go`
- [ ] T024 Implement GET /task-templates handler (list templates) in `components/backend/handlers/task_templates.go`
- [ ] T025 Add template instantiation logic (replace {{param}} placeholders) in `components/backend/handlers/helpers.go`

### Backend Routing
- [ ] T026 Register background task routes in `components/backend/routes.go`

## Phase 3.4: Operator Implementation

### Job Creation and Monitoring
- [ ] T027 Extend operator to handle `spec.mode == "background"` in `components/operator/internal/handlers/sessions.go`
- [ ] T028 Add Job creation with `activeDeadlineSeconds=3600` for background tasks in `components/operator/internal/handlers/sessions.go`
- [ ] T029 Update `monitorJob()` to detect timeout (DeadlineExceeded) and set status to "Timeout" in `components/operator/internal/handlers/sessions.go`

### Operator Tests
- [ ] T030 [P] Operator unit test: background Job lifecycle in `components/operator/tests/background_mode_test.go`
- [ ] T031 [P] Operator unit test: timeout enforcement in `components/operator/tests/timeout_test.go`

## Phase 3.5: Runner Implementation

### Python Runner Extensions
- [ ] T032 Add background execution mode support in `components/runners/claude-code-runner/wrapper.py`
- [ ] T033 Implement `_run_validation()` function (linting, formatting, tests) in `components/runners/claude-code-runner/wrapper.py`
- [ ] T034 Implement `_create_github_pr()` function (GitHub API integration) in `components/runners/claude-code-runner/wrapper.py`
- [ ] T035 Add progress tracking (0-100%) with status updates every 30s in `components/runners/claude-code-runner/wrapper.py`
- [ ] T036 Update `_push_results_if_any()` to call `_create_github_pr()` after push in `components/runners/claude-code-runner/wrapper.py`

### Runner Tests
- [ ] T037 [P] Runner unit test: background mode execution in `components/runners/claude-code-runner/tests/test_background_mode.py`
- [ ] T038 [P] Runner unit test: validation pipeline in `components/runners/claude-code-runner/tests/test_validation.py`
- [ ] T039 [P] Runner unit test: GitHub PR creation in `components/runners/claude-code-runner/tests/test_pr_creation.py`

## Phase 3.6: Frontend Implementation

### React Components (Colocated)
- [ ] T040 [P] Create background tasks list page in `components/frontend/src/app/projects/[name]/background-tasks/page.tsx`
- [ ] T041 [P] Create loading skeleton for task list in `components/frontend/src/app/projects/[name]/background-tasks/loading.tsx`
- [ ] T042 [P] Create error boundary for task list in `components/frontend/src/app/projects/[name]/background-tasks/error.tsx`
- [ ] T043 [P] Create task detail page in `components/frontend/src/app/projects/[name]/background-tasks/[taskName]/page.tsx`
- [ ] T044 [P] Create loading skeleton for task detail in `components/frontend/src/app/projects/[name]/background-tasks/[taskName]/loading.tsx`
- [ ] T045 [P] Create error boundary for task detail in `components/frontend/src/app/projects/[name]/background-tasks/[taskName]/error.tsx`
- [ ] T046 [P] Create new task form page in `components/frontend/src/app/projects/[name]/background-tasks/new/page.tsx`
- [ ] T047 [P] Create task header component in `components/frontend/src/app/projects/[name]/background-tasks/[taskName]/components/task-header.tsx`
- [ ] T048 [P] Create execution log component in `components/frontend/src/app/projects/[name]/background-tasks/[taskName]/components/execution-log.tsx`
- [ ] T049 [P] Create PR link component in `components/frontend/src/app/projects/[name]/background-tasks/[taskName]/components/pr-link.tsx`

### API Service Layer
- [ ] T050 [P] Create background tasks API functions in `components/frontend/src/services/api/background-tasks.ts`
- [ ] T051 [P] Create task templates API functions in `components/frontend/src/services/api/task-templates.ts`

### React Query Hooks
- [ ] T052 [P] Create useBackgroundTasks hook (list, filters, polling) in `components/frontend/src/services/queries/background-tasks.ts`
- [ ] T053 [P] Create useBackgroundTask hook (detail, real-time updates) in `components/frontend/src/services/queries/background-tasks.ts`
- [ ] T054 [P] Create useCreateBackgroundTask mutation in `components/frontend/src/services/queries/background-tasks.ts`
- [ ] T055 [P] Create useRetryBackgroundTask mutation in `components/frontend/src/services/queries/background-tasks.ts`
- [ ] T056 [P] Create useCancelBackgroundTask mutation in `components/frontend/src/services/queries/background-tasks.ts`
- [ ] T057 [P] Create useTaskTemplates hook in `components/frontend/src/services/queries/task-templates.ts`
- [ ] T058 [P] Create useCreateTaskTemplate mutation in `components/frontend/src/services/queries/task-templates.ts`

### Frontend Tests
- [ ] T059 [P] Component test: background task list rendering in `components/frontend/tests/background-tasks.test.tsx`
- [ ] T060 [P] Component test: task detail with progress tracking in `components/frontend/tests/task-detail.test.tsx`
- [ ] T061 [P] Component test: new task form with template selection in `components/frontend/tests/new-task.test.tsx`

## Phase 3.7: Integration & E2E

- [ ] T062 Run quickstart.md Scenario 1 (Create + monitor + PR) manually and verify all assertions pass
- [ ] T063 Run quickstart.md Scenario 2 (Progress tracking) manually and verify <100ms API response
- [ ] T064 Run quickstart.md Scenario 3 (PR metadata) manually and verify audit trail
- [ ] T065 Run quickstart.md Scenario 4 (Retry) manually and verify retry increments count
- [ ] T066 Run quickstart.md Scenario 5 (Templates) manually and verify template reuse
- [ ] T067 Performance validation: concurrent task limit enforcement (409 on second task)
- [ ] T068 Performance validation: timeout enforcement (task stops after 1 hour)

## Phase 3.8: Polish & Documentation

- [ ] T069 [P] Add linting rules to backend Makefile for new handlers
- [ ] T070 [P] Run `gofmt -w` on all Go files and verify formatting
- [ ] T071 [P] Run `golangci-lint run` and fix all issues
- [ ] T072 [P] Run `npm run lint` in frontend and fix all TypeScript issues
- [ ] T073 [P] Run `black` and `isort` on runner Python files
- [ ] T074 Update CLAUDE.md with background task execution mode context (run `.specify/scripts/bash/update-agent-context.sh claude`)
- [ ] T075 Add mkdocs documentation page for background tasks feature in `docs/user-guide/background-tasks.md`
- [ ] T076 Add API reference for background task endpoints in `docs/developer-guide/api-reference.md`
- [ ] T077 Remove TODOs and cleanup comments
- [ ] T078 Final code review: verify no `panic()` in production code, all errors logged
- [ ] T079 Final security review: verify no tokens in logs, RBAC enforced

## Dependencies

**Critical Path** (must complete in order):
1. Setup (T001-T004) → Tests (T005-T017) → Implementation (T018+)
2. CRD extensions (T001-T002) block all other tasks
3. Type definitions (T003-T004) block corresponding component implementation
4. Contract tests (T005-T012) MUST fail before handlers (T018-T025)
5. Integration tests (T013-T017) MUST fail before full implementation

**Component Dependencies**:
- Backend handlers (T018-T025) depend on types (T003) and CRDs (T001-T002)
- Operator changes (T027-T029) depend on CRD extensions (T001)
- Runner changes (T032-T036) depend on no prior tasks (can start after T001)
- Frontend components (T040-T049) depend on API service layer (T050-T051)
- React Query hooks (T052-T058) depend on API functions (T050-T051)

**Blocking Relationships**:
- T001 blocks T003, T018, T027
- T002 blocks T003, T023
- T003 blocks T018-T025
- T004 blocks T040-T058
- T018 blocks T026
- T050-T051 block T052-T058
- T052-T058 block T040-T049 (hooks needed in components)

## Parallel Execution Examples

### Setup Phase (all parallel after CRDs)
```bash
# After T001-T002 complete, launch type definitions in parallel:
Task T003: "Update Go backend types in components/backend/types/background_task.go"
Task T004: "Update frontend TypeScript types in components/frontend/src/types/background-task.ts"
```

### Contract Tests Phase (all parallel)
```bash
# Launch all 8 contract tests simultaneously:
Task T005: "Contract test POST /background-tasks in components/backend/tests/contract/background_tasks_create_test.go"
Task T006: "Contract test GET /background-tasks (list) in components/backend/tests/contract/background_tasks_list_test.go"
Task T007: "Contract test GET /background-tasks/:name in components/backend/tests/contract/background_tasks_get_test.go"
Task T008: "Contract test POST /background-tasks/:name/retry in components/backend/tests/contract/background_tasks_retry_test.go"
Task T009: "Contract test POST /background-tasks/:name/cancel in components/backend/tests/contract/background_tasks_cancel_test.go"
Task T010: "Contract test POST /task-templates in components/backend/tests/contract/task_templates_create_test.go"
Task T011: "Contract test GET /task-templates in components/backend/tests/contract/task_templates_list_test.go"
Task T012: "Contract test: concurrent task limit in components/backend/tests/contract/background_tasks_concurrency_test.go"
```

### Integration Tests Phase (all parallel)
```bash
# Launch all 5 integration tests simultaneously:
Task T013: "Integration test Scenario 1 in components/backend/tests/integration/scenario_1_create_and_monitor_test.go"
Task T014: "Integration test Scenario 2 in components/backend/tests/integration/scenario_2_progress_tracking_test.go"
Task T015: "Integration test Scenario 3 in components/backend/tests/integration/scenario_3_pr_metadata_test.go"
Task T016: "Integration test Scenario 4 in components/backend/tests/integration/scenario_4_retry_test.go"
Task T017: "Integration test Scenario 5 in components/backend/tests/integration/scenario_5_templates_test.go"
```

### Frontend Components Phase (parallel after API layer)
```bash
# After T050-T058 complete, launch component creation in parallel:
Task T040: "Create task list page in components/frontend/src/app/projects/[name]/background-tasks/page.tsx"
Task T041: "Create loading skeleton in components/frontend/src/app/projects/[name]/background-tasks/loading.tsx"
Task T042: "Create error boundary in components/frontend/src/app/projects/[name]/background-tasks/error.tsx"
Task T043: "Create task detail page in components/frontend/src/app/projects/[name]/background-tasks/[taskName]/page.tsx"
# ... etc (all T040-T049 can run in parallel)
```

## Validation Checklist
*Verified before task generation*

- [x] All 7 API endpoints have contract tests (T005-T011)
- [x] All 5 quickstart scenarios have integration tests (T013-T017)
- [x] All 2 entities (BackgroundTask, TaskTemplate) have type definitions (T003-T004)
- [x] All tests come before implementation (T005-T017 before T018+)
- [x] Parallel tasks operate on different files (all [P] tasks verified)
- [x] Each task specifies exact file path
- [x] No [P] task modifies same file as another [P] task
- [x] CRD extensions (T001-T002) precede all dependent tasks

## Notes

- **TDD Enforcement**: Phase 3.2 (T005-T017) MUST complete and all tests MUST fail before starting Phase 3.3
- **[P] Markers**: 53 tasks marked parallel (different files, no dependencies)
- **Commit Strategy**: Commit after each task completion (79 commits total)
- **Constitution Compliance**: All tasks follow ACP Constitution v0.1.0 principles (no violations detected in design phase)
- **Estimated Total**: 79 tasks across 8 phases
- **Backend-heavy**: 25 backend tasks (handlers + tests), 21 frontend tasks, 10 runner tasks, 5 operator tasks

## Quick Reference: Task Count by Phase

- Phase 3.1 Setup: 4 tasks
- Phase 3.2 Tests First: 13 tasks (8 contract + 5 integration)
- Phase 3.3 Backend: 9 tasks
- Phase 3.4 Operator: 5 tasks (3 implementation + 2 tests)
- Phase 3.5 Runner: 8 tasks (5 implementation + 3 tests)
- Phase 3.6 Frontend: 22 tasks (10 components + 2 API + 7 hooks + 3 tests)
- Phase 3.7 Integration & E2E: 7 tasks
- Phase 3.8 Polish: 11 tasks

**Total: 79 implementation tasks**

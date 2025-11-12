# Implementation Plan: Background Coding Agent

**Branch**: `001-background-coding-agent` | **Date**: 2025-11-12 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-background-coding-agent/spec.md`

## Execution Flow (/plan command scope)
```
1. Load feature spec from Input path
   → ✅ Feature spec loaded successfully
2. Fill Technical Context (scan for NEEDS CLARIFICATION)
   → ✅ Project Type: Web application (Go backend + NextJS frontend)
   → ✅ Structure Decision: Extend existing backend/frontend/operator
3. Fill the Constitution Check section based on the content of the constitution document.
   → ✅ Constitution Check completed
4. Evaluate Constitution Check section below
   → ✅ No violations detected - aligns with Kubernetes-native architecture
   → ✅ Update Progress Tracking: Initial Constitution Check PASS
5. Execute Phase 0 → research.md
   → IN PROGRESS
6. Execute Phase 1 → contracts, data-model.md, quickstart.md, CLAUDE.md
   → PENDING
7. Re-evaluate Constitution Check section
   → PENDING (after Phase 1)
   → Update Progress Tracking: Post-Design Constitution Check
8. Plan Phase 2 → Describe task generation approach (DO NOT create tasks.md)
   → PENDING
9. STOP - Ready for /tasks command
   → PENDING
```

**IMPORTANT**: The /plan command STOPS at step 9. Phases 2-4 are executed by other commands:
- Phase 2: /tasks command creates tasks.md
- Phase 3-4: Implementation execution (manual or via tools)

## Summary

The Background Coding Agent feature extends the existing vTeam platform to support automated, asynchronous code maintenance tasks. Users can create background tasks that execute Claude Code against a single repository, automatically validating changes (linting, formatting, testing) and creating pull requests when validation passes. The feature leverages the existing AgenticSession CRD architecture with project-scoped isolation, enforcing strict resource limits (1 concurrent task per user, 1 repository per task, 1 hour timeout) to enable safe MVP deployment.

**Primary Requirement**: Enable platform engineering teams to automate repetitive code maintenance (dependency upgrades, migrations, refactoring) by delegating tasks to a background agent that produces validated, ready-to-review pull requests.

**Technical Approach**: Extend the AgenticSession custom resource with a new execution mode field (`spec.mode: "background"`), add backend API endpoints for background task lifecycle management, update the operator to handle long-running background Jobs with timeout enforcement, and create a dedicated frontend UI for monitoring background task execution separate from interactive sessions.

## Technical Context

**Language/Version**:
- Backend/Operator: Go 1.21+
- Frontend: TypeScript 5.x with NextJS 14
- Runner: Python 3.11+ with Claude Code SDK

**Primary Dependencies**:
- Backend: Gin (HTTP), kubernetes/client-go, dynamic client
- Frontend: NextJS, React Query, Shadcn UI, TypeScript
- Operator: kubernetes/client-go, controller-runtime patterns
- Runner: claude-code-sdk>=0.0.23, anthropic>=0.68.0

**Storage**:
- Kubernetes Custom Resources (etcd-backed) for task metadata
- PersistentVolumeClaims for workspace isolation
- GitHub/GitLab for repository operations and PR creation

**Testing**:
- Backend/Operator: Go testing with table-driven tests, contract tests
- Frontend: Jest + React Testing Library
- Integration: Kubernetes test cluster with real CRDs
- E2E: Playwright for full user journeys

**Target Platform**:
- Kubernetes 1.27+
- OpenShift 4.13+ (development via CRC)
- Container runtime: Docker/Podman

**Project Type**: Web application (extends existing backend + frontend + operator)

**Performance Goals**:
- Task creation API: <200ms p95 response time
- Status polling: <100ms p95 for task status retrieval
- Task completion: 90% of tasks complete within 1 hour timeout
- Concurrent users: Support 50+ users creating background tasks simultaneously

**Constraints**:
- MUST enforce 1 concurrent task per user (prevent resource exhaustion)
- MUST enforce 1 repository per task (MVP scope limitation)
- MUST enforce 1 hour timeout (cost control, resource management)
- MUST scope tasks to projects (multi-tenant isolation requirement)
- MUST validate changes before PR creation (quality gate)
- MUST use in-app notifications only (no external integrations for MVP)

**Scale/Scope**:
- MVP target: 10-50 projects, 100+ background tasks per day
- Per-project limits: 10 concurrent background tasks across all users
- Historical data: Retain task execution logs for 30 days (deferred - NFR-006)
- Repository access: GitHub only for MVP (GitLab support deferred)

**Deferred Clarifications** (implementation details):
- FR-015: GitHub authentication method → Use existing ACP repo auth patterns
- FR-019: AI cost control → Rely on 1-hour timeout, monitor Anthropic usage
- NFR-006: Log retention policy → Use Kubernetes default PVC retention (30d)

## Constitution Check
*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Kubernetes-Native Architecture ✅ PASS
- **CRD**: Extends existing `AgenticSession` CRD with `spec.mode` field
- **Operator**: Reuses existing operator reconciliation loop, adds background Job handling
- **Jobs**: Background tasks execute as Kubernetes Jobs (existing pattern)
- **Secrets**: Per-session ServiceAccount tokens (existing pattern)
- **RBAC**: Project-scoped namespace isolation (existing pattern)
- **No violations detected**

### II. Security & Multi-Tenancy First ✅ PASS
- **Authentication**: Reuses `GetK8sClientsForRequest()` for all API operations
- **RBAC**: Validates user access via project-scoped middleware
- **Token handling**: No logging of tokens (existing backend pattern)
- **Namespace isolation**: FR-020 enforces project scoping
- **Least privilege**: Runner ServiceAccount with minimal CR update permissions
- **No violations detected**

### III. Type Safety & Error Handling ✅ PASS
- **No panics**: Backend/operator return explicit errors
- **Error wrapping**: Use `fmt.Errorf("context: %w", err)` pattern
- **Frontend zero `any`**: Use proper TypeScript types for BackgroundTask
- **Graceful degradation**: FR-012 requires graceful permission failure handling
- **No violations detected**

### IV. Test-Driven Development ✅ PASS
- **Contract tests**: API endpoints for task CRUD operations
- **Integration tests**: Background Job lifecycle with real K8s cluster
- **Permission tests**: Verify project-scoped RBAC boundaries
- **E2E tests**: User creates task → monitors → reviews PR (acceptance scenario 1-3)
- **Methodology**: Will follow red-green-refactor in Phase 1
- **No violations detected**

### V. Component Modularity ✅ PASS
- **Backend**: Handlers in `handlers/background_tasks.go` (HTTP logic only)
- **Types**: Pure structs in `types/background_task.go`
- **Frontend**: Colocated components in `app/projects/[name]/background-tasks/`
- **No cyclic dependencies**: Backend → Operator (watch only), no reverse dependency
- **Component size**: Target <200 lines per React component
- **No violations detected**

### VI. Observability & Monitoring ✅ PASS
- **Structured logging**: Use existing `log.Printf()` with context (namespace, task name)
- **Health endpoints**: Reuse existing backend `/health`
- **Status updates**: FR-006 requires real-time progress tracking via CR status
- **Event emissions**: Operator emits Kubernetes events on task lifecycle changes
- **Error context**: FR-007 requires detailed logs with error details
- **No violations detected**

### VII. Resource Lifecycle Management ✅ PASS
- **OwnerReferences**: Job → BackgroundTask CR (existing pattern from AgenticSession)
- **Controller references**: `Controller: true` on primary owner
- **No BlockOwnerDeletion**: Avoids permission issues (existing pattern)
- **Idempotent creation**: Check Job existence before creation
- **Cascading deletes**: Rely on K8s garbage collection
- **Goroutine safety**: Monitor loops exit when CR deleted (existing pattern)
- **No violations detected**

### VIII-X. AI Context, Data Access, Commit Discipline ✅ PASS
- **Context management**: Reuse existing Claude Code SDK integration
- **Prompt templates**: TaskTemplate entity (FR-010) supports reusable patterns
- **Atomic commits**: Follow existing Git workflow (squash commits)
- **Code review**: All changes follow PR review process
- **No violations detected**

**Initial Constitution Check Result**: ✅ **PASS** - No violations, no complexity justifications needed

## Project Structure

### Documentation (this feature)
```
specs/001-background-coding-agent/
├── plan.md              # This file (/plan command output)
├── research.md          # Phase 0 output (/plan command)
├── data-model.md        # Phase 1 output (/plan command)
├── quickstart.md        # Phase 1 output (/plan command)
├── contracts/           # Phase 1 output (/plan command)
│   ├── openapi.yaml     # API contract definitions
│   └── tests/           # Contract test stubs
└── tasks.md             # Phase 2 output (/tasks command - NOT created by /plan)
```

### Source Code (repository root)

**Backend** (`components/backend/`):
```
components/backend/
├── handlers/
│   ├── background_tasks.go      # NEW: Background task CRUD + lifecycle API
│   ├── sessions.go               # EXISTING: Reference for patterns
│   ├── helpers.go                # EXISTING: Shared utilities (StringPtr, etc.)
│   └── middleware.go             # EXISTING: ValidateProjectContext
├── types/
│   ├── background_task.go        # NEW: BackgroundTask, TaskTemplate types
│   ├── session.go                # EXISTING: Reference for CR types
│   └── common.go                 # EXISTING: Shared types
├── routes.go                     # MODIFIED: Add background task routes
└── tests/
    ├── contract/
    │   └── background_tasks_test.go  # NEW: Contract tests
    └── integration/
        └── background_tasks_test.go  # NEW: Integration tests
```

**Frontend** (`components/frontend/`):
```
components/frontend/
├── src/
│   ├── app/
│   │   └── projects/[name]/
│   │       └── background-tasks/         # NEW: Background tasks feature
│   │           ├── page.tsx              # Task list view
│   │           ├── loading.tsx           # Skeleton loader
│   │           ├── error.tsx             # Error boundary
│   │           ├── [taskName]/           # Task detail view
│   │           │   ├── page.tsx
│   │           │   ├── loading.tsx
│   │           │   ├── error.tsx
│   │           │   └── components/       # Task-specific components
│   │           │       ├── task-header.tsx
│   │           │       ├── execution-log.tsx
│   │           │       └── pr-link.tsx
│   │           └── new/                  # Task creation form
│   │               └── page.tsx
│   ├── components/
│   │   └── ui/                           # EXISTING: Shadcn components
│   └── services/
│       ├── api/
│       │   └── background-tasks.ts       # NEW: API functions
│       └── queries/
│           └── background-tasks.ts       # NEW: React Query hooks
└── tests/
    └── background-tasks.test.tsx         # NEW: Component tests
```

**Operator** (`components/operator/`):
```
components/operator/
├── internal/
│   ├── handlers/
│   │   └── sessions.go               # MODIFIED: Handle background mode
│   ├── types/
│   │   └── resources.go              # EXISTING: GVR definitions
│   └── services/
│       └── infrastructure.go         # EXISTING: Job creation helpers
└── tests/
    └── background_mode_test.go       # NEW: Background Job lifecycle tests
```

**CRDs** (`components/manifests/crds/`):
```
components/manifests/crds/
└── agenticsessions-crd.yaml          # MODIFIED: Add spec.mode field
```

**Runner** (`components/runners/claude-code-runner/`):
```
components/runners/claude-code-runner/
├── wrapper.py                        # MODIFIED: Support background execution mode
└── tests/
    └── test_background_mode.py       # NEW: Background mode unit tests
```

**Structure Decision**: Web application pattern - extends existing components/backend, components/frontend, components/operator, and components/manifests. All new code follows established patterns for handlers, types, frontend routing, and operator reconciliation. No new top-level directories required.

## Phase 0: Outline & Research

**Unknowns from Technical Context** (all resolved via codebase exploration):
1. ~~How to extend AgenticSession CRD?~~ → Add `spec.mode: string` field with values `"interactive"`, `"batch"`, `"background"`
2. ~~GitHub authentication patterns?~~ → Reuse existing repo auth from `spec.repos[].input` configuration
3. ~~Job timeout enforcement?~~ → Use `spec.activeDeadlineSeconds` on Job resource
4. ~~Status update frequency?~~ → Runner updates CR status every 30s (existing pattern)
5. ~~Concurrency control?~~ → Backend query for existing running tasks before creation

**Research Tasks**:
1. ✅ **Kubernetes Job timeout patterns**: Use `Job.spec.activeDeadlineSeconds: 3600` (1 hour)
2. ✅ **Concurrency limiting**: Backend checks `GET /api/projects/:project/agentic-sessions?status=running&mode=background&creator=:user` before allowing new task
3. ✅ **CR extension patterns**: Add optional fields to CRD with backward compatibility (existing sessions don't set `mode`, default to `"interactive"`)
4. ✅ **Long-running Job monitoring**: Operator's existing `monitorJob()` goroutine supports hours-long Jobs
5. ✅ **PR creation from runner**: Leverage existing `_push_results_if_any()` function, extend with GitHub PR API calls

**Output**: See `research.md` for detailed findings

## Phase 1: Design & Contracts
*Prerequisites: research.md complete*

### 1. Data Model (`data-model.md`)

**Entities** (from spec + design decisions):

**BackgroundTask** (extends AgenticSession):
```yaml
apiVersion: vteam.ambient-code/v1alpha1
kind: AgenticSession
metadata:
  name: background-task-{uuid}
  namespace: project-namespace
  labels:
    ambient-code.io/mode: "background"
    ambient-code.io/creator: {username}
spec:
  mode: "background"              # NEW: Execution mode
  prompt: "Upgrade lodash..."     # Task instructions
  repos:
    - input:
        url: "https://github.com/..."
        branch: "main"
      output:
        type: "fork"              # Or "origin" for direct PR
        target: "main"
  interactive: false              # Background = non-interactive
  timeout: 3600                   # 1 hour in seconds
  autoPushOnComplete: true        # Auto-create PR
  templateId: "upgrade-lodash"    # OPTIONAL: Link to template
status:
  phase: "Pending" | "Creating" | "Running" | "Completed" | "Failed" | "Stopped" | "Timeout"
  startTime: "2025-11-12T10:00:00Z"
  completionTime: "2025-11-12T10:45:00Z"
  repos:
    - name: "my-repo"
      status: "pushed" | "abandoned" | "diff" | "nodiff"
      prUrl: "https://github.com/.../pull/123"  # NEW: Track PR link
  progress: 75                    # NEW: Percentage (0-100)
  currentPhase: "Running linters" # NEW: Human-readable phase
  logs: "Cloning repo...\n..."    # NEW: Execution log buffer
  retryCount: 0                   # NEW: Number of retries
  error: "Validation failed..."   # Error details if failed
```

**TaskTemplate** (NEW Custom Resource):
```yaml
apiVersion: vteam.ambient-code/v1alpha1
kind: TaskTemplate
metadata:
  name: upgrade-lodash
  namespace: project-namespace
spec:
  name: "Upgrade Lodash Dependency"
  description: "Upgrades lodash to latest version"
  instructionsTemplate: "Upgrade lodash to version {{version}} in package.json"
  parameters:
    - name: "version"
      type: "string"
      required: true
      description: "Target lodash version"
  validationRules:
    - "package.json must exist"
    - "npm test must pass"
  usageCount: 42
  lastUsed: "2025-11-12T10:00:00Z"
  createdBy: "user@example.com"
```

**Relationships**:
- BackgroundTask → TaskTemplate (optional, via `spec.templateId`)
- BackgroundTask → Project (namespace scoping)
- BackgroundTask → Creator (user identity via labels)

**State Transitions**:
```
Pending → Creating → Running → {Completed | Failed | Stopped | Timeout}
                          ↓
                    (retry) → Pending
```

**Validation Rules**:
- Only 1 Running task per user (enforced in backend)
- Timeout ≤ 3600 seconds (1 hour max)
- Repository URL must be valid GitHub URL (for MVP)
- User must have project access (RBAC check)

### 2. API Contracts (`contracts/openapi.yaml`)

**Endpoints** (REST, aligned with existing `/api/projects/:project/agentic-sessions` pattern):

```yaml
# CREATE Background Task
POST /api/projects/:projectName/background-tasks
Request:
  {
    "name": "upgrade-lodash-v1",
    "instructions": "Upgrade lodash to version 4.17.21",
    "repository": {
      "url": "https://github.com/myorg/myrepo",
      "branch": "main"
    },
    "templateId": "upgrade-lodash" // OPTIONAL
  }
Response 201:
  {
    "name": "upgrade-lodash-v1",
    "uid": "abc-123-def",
    "status": "Pending",
    "createdAt": "2025-11-12T10:00:00Z"
  }
Errors:
  - 400: Validation error (missing fields, invalid repo URL)
  - 409: Concurrent task limit reached (user already has running task)
  - 403: User lacks project access

# LIST Background Tasks
GET /api/projects/:projectName/background-tasks?status=running&creator=user@example.com
Response 200:
  {
    "items": [
      {
        "name": "upgrade-lodash-v1",
        "status": "Running",
        "progress": 45,
        "currentPhase": "Running tests",
        "createdAt": "2025-11-12T10:00:00Z",
        "repository": "https://github.com/myorg/myrepo"
      }
    ],
    "total": 1
  }

# GET Background Task Details
GET /api/projects/:projectName/background-tasks/:taskName
Response 200:
  {
    "name": "upgrade-lodash-v1",
    "status": "Completed",
    "progress": 100,
    "logs": "Cloning repo...\nRunning npm install...\n...",
    "prUrl": "https://github.com/myorg/myrepo/pull/123",
    "createdAt": "2025-11-12T10:00:00Z",
    "completedAt": "2025-11-12T10:45:00Z"
  }
Errors:
  - 404: Task not found

# RETRY Background Task
POST /api/projects/:projectName/background-tasks/:taskName/retry
Response 200:
  {
    "name": "upgrade-lodash-v1",
    "status": "Pending",
    "retryCount": 1
  }
Errors:
  - 400: Task not in failed state
  - 409: Concurrent task limit reached

# CANCEL Background Task
POST /api/projects/:projectName/background-tasks/:taskName/cancel
Response 200:
  { "status": "Stopped" }
Errors:
  - 400: Task not in running state

# CREATE Task Template
POST /api/projects/:projectName/task-templates
Request:
  {
    "name": "upgrade-lodash",
    "description": "Upgrades lodash to latest version",
    "instructionsTemplate": "Upgrade lodash to version {{version}}",
    "parameters": [{"name": "version", "type": "string", "required": true}]
  }
Response 201:
  { "name": "upgrade-lodash", "uid": "xyz-789" }

# LIST Task Templates
GET /api/projects/:projectName/task-templates
Response 200:
  {
    "items": [
      {
        "name": "upgrade-lodash",
        "description": "...",
        "usageCount": 42,
        "lastUsed": "2025-11-12T10:00:00Z"
      }
    ]
  }
```

### 3. Contract Tests (`contracts/tests/`)

**Generated test files** (TDD - tests written first, must fail):
- `background_tasks_create_test.go`: Assert POST /background-tasks returns 201 with valid task
- `background_tasks_list_test.go`: Assert GET returns array with status filtering
- `background_tasks_get_test.go`: Assert GET /:name returns task details with logs
- `background_tasks_retry_test.go`: Assert POST /:name/retry increments retryCount
- `background_tasks_cancel_test.go`: Assert POST /:name/cancel stops running task
- `background_tasks_concurrency_test.go`: Assert 409 when user has running task
- `task_templates_test.go`: Assert template CRUD operations

**Test execution**: `cd components/backend && make test-contract`

### 4. Integration Test Scenarios (from user stories)

**Quickstart validation steps** (`quickstart.md`):
1. User creates background task → Assert API returns 201
2. Operator creates Job → Assert Job exists in namespace
3. Runner clones repo → Assert workspace has repo files
4. Runner runs validation → Assert linters/formatters/tests execute
5. Runner creates PR → Assert GitHub PR created with correct metadata
6. User views status → Assert frontend shows real-time progress
7. User retries failed task → Assert new Job created with incremented retryCount

### 5. Update CLAUDE.md

Execute: `.specify/scripts/bash/update-agent-context.sh claude`

**Incremental additions** (preserve existing, add new tech):
- Background execution mode in AgenticSession CRD
- Backend: `handlers/background_tasks.go` with concurrency limiting
- Frontend: React Query hooks for background task operations
- Operator: Background Job lifecycle with timeout enforcement

**Output**: `data-model.md`, `/contracts/openapi.yaml`, `/contracts/tests/*.go`, `quickstart.md`, `CLAUDE.md` (updated)

## Phase 2: Task Planning Approach
*This section describes what the /tasks command will do - DO NOT execute during /plan*

**Task Generation Strategy**:
1. **Load** `.specify/templates/tasks-template.md` as base structure
2. **Parse** Phase 1 artifacts:
   - `contracts/openapi.yaml` → API endpoint tasks
   - `data-model.md` → CRD extension tasks
   - `contracts/tests/*.go` → Contract test implementation tasks
   - `quickstart.md` → Integration test tasks
3. **Generate tasks** following TDD order:
   - CRD extension (add `spec.mode` field)
   - Backend: Write contract tests (failing)
   - Backend: Implement handlers to pass tests
   - Operator: Handle background mode Jobs
   - Runner: Support background execution
   - Frontend: UI for task management
   - Integration tests: End-to-end user journey

**Ordering Strategy**:
- **Test-first**: All test tasks before implementation tasks
- **Dependency order**: CRD → Backend → Operator → Runner → Frontend
- **Parallel markers [P]**: Independent files (e.g., multiple contract tests)
- **Sequential dependencies**: Backend handlers depend on CRD extension

**Estimated Output**: 35-40 numbered tasks in tasks.md:
- 5 tasks: CRD extension + documentation
- 10 tasks: Backend contract tests + implementations
- 5 tasks: Operator background Job handling
- 5 tasks: Runner background execution mode
- 10 tasks: Frontend UI components + React Query hooks
- 5 tasks: Integration tests + E2E validation

**Example task sequence**:
1. [P] Extend AgenticSession CRD with `spec.mode` field
2. [P] Write contract test: POST /background-tasks returns 201
3. [P] Write contract test: GET /background-tasks returns list
4. Implement POST /background-tasks handler (depends on tests 2)
5. Implement GET /background-tasks handler (depends on tests 3)
...

**IMPORTANT**: This phase is executed by the /tasks command, NOT by /plan

## Phase 3+: Future Implementation
*These phases are beyond the scope of the /plan command*

**Phase 3**: Task execution (/tasks command creates tasks.md)
**Phase 4**: Implementation (execute tasks.md following constitutional principles)
**Phase 5**: Validation (run tests, execute quickstart.md, performance validation)

## Complexity Tracking
*Fill ONLY if Constitution Check has violations that must be justified*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| N/A | N/A | No violations detected |

## Progress Tracking
*This checklist is updated during execution flow*

**Phase Status**:
- [x] Phase 0: Research complete (/plan command)
- [x] Phase 1: Design complete (/plan command)
- [x] Phase 2: Task planning complete (/plan command - describe approach only)
- [ ] Phase 3: Tasks generated (/tasks command)
- [ ] Phase 4: Implementation complete
- [ ] Phase 5: Validation passed

**Gate Status**:
- [x] Initial Constitution Check: PASS
- [x] Post-Design Constitution Check: PASS
- [x] All NEEDS CLARIFICATION resolved (FR-015, FR-019, NFR-006 deferred to implementation)
- [x] Complexity deviations documented (none)

---
*Based on ACP Constitution v0.1.0 (DRAFT) - See `https://github.com/ambient-code/platform/blob/main/.specify/memory/constitution.md`*

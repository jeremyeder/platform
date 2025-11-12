# Data Model: Background Coding Agent

**Feature**: Background Coding Agent
**Date**: 2025-11-12
**Status**: Design Complete

## Overview

The background coding agent extends the existing `AgenticSession` custom resource with a new execution mode field and adds a new `TaskTemplate` custom resource for reusable task definitions. All data is stored in Kubernetes Custom Resources (backed by etcd) with project-scoped namespace isolation.

## Entity Definitions

### 1. BackgroundTask (extends AgenticSession)

**Type**: Extension of existing `AgenticSession` CRD
**API Group**: `vteam.ambient-code`
**API Version**: `v1alpha1`
**Scope**: Namespaced (project-scoped)

**Full CRD Spec**:

```yaml
apiVersion: vteam.ambient-code/v1alpha1
kind: AgenticSession
metadata:
  name: "background-task-upgrade-lodash-abc123"  # Format: background-task-{name}-{uuid}
  namespace: "project-myproject"                  # Project namespace
  labels:
    ambient-code.io/mode: "background"            # NEW: Identify background tasks
    ambient-code.io/creator: "user@example.com"   # NEW: Track task creator
    ambient-code.io/template: "upgrade-lodash"    # OPTIONAL: Link to template
  annotations:
    ambient-code.io/retry-count: "0"              # NEW: Number of retries
spec:
  # NEW FIELD: Execution mode
  mode: "background"  # Values: "interactive" | "batch" | "background"

  # Existing fields (reused from AgenticSession)
  prompt: "Upgrade lodash to version 4.17.21 in package.json and update all imports"

  repos:
    - input:
        url: "https://github.com/myorg/myrepo"
        branch: "main"
      output:
        type: "fork"     # or "origin" for direct PR
        target: "main"   # base branch for PR

  interactive: false   # Background mode is always non-interactive
  timeout: 3600        # 1 hour (seconds)
  autoPushOnComplete: true  # Auto-create PR after validation

  # OPTIONAL: Link to task template (NEW)
  templateId: "upgrade-lodash"

status:
  # Existing phase field (reused)
  phase: "Pending"  # Values: Pending | Creating | Running | Completed | Failed | Stopped | Timeout

  # NEW FIELDS for background tasks
  progress: 0        # Percentage complete (0-100)
  currentPhase: "Initializing workspace"  # Human-readable current phase
  logs: ""           # Execution log buffer (last 10KB)
  retryCount: 0      # Number of times task has been retried

  # Existing timing fields (reused)
  startTime: "2025-11-12T10:00:00Z"
  completionTime: "2025-11-12T10:45:00Z"

  # Existing repo status (extended)
  repos:
    - name: "myrepo"
      status: "pushed"  # Values: pushed | abandoned | diff | nodiff
      prUrl: "https://github.com/myorg/myrepo/pull/123"  # NEW: Track PR link

  # Existing error field (reused)
  error: "Validation failed: npm test returned non-zero exit code"
```

**Field Descriptions**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `spec.mode` | string | Yes | Execution mode: `"interactive"`, `"batch"`, or `"background"`. Defaults to `"interactive"` for backward compatibility. |
| `spec.prompt` | string | Yes | Natural language instructions for the coding task (FR-002) |
| `spec.repos[]` | array | Yes | List of repositories to operate on (limited to 1 for background mode per FR-017) |
| `spec.interactive` | boolean | Yes | Must be `false` for background mode |
| `spec.timeout` | integer | Yes | Task timeout in seconds (max 3600 for background mode per FR-017) |
| `spec.autoPushOnComplete` | boolean | Yes | Must be `true` for background mode (FR-016: auto-create PR) |
| `spec.templateId` | string | No | Reference to TaskTemplate for reusable task patterns (FR-010) |
| `status.progress` | integer | No | Task completion percentage 0-100 (FR-006: progress tracking) |
| `status.currentPhase` | string | No | Human-readable description of current execution phase |
| `status.logs` | string | No | Execution log buffer (last 10KB, full logs in pod) (FR-007) |
| `status.retryCount` | integer | No | Number of times task has been retried (FR-008) |
| `status.repos[].prUrl` | string | No | GitHub/GitLab PR URL if created (FR-009: PR metadata) |

**Validation Rules**:

```yaml
# CRD OpenAPIV3Schema validation
spec:
  properties:
    mode:
      type: string
      enum: ["interactive", "batch", "background"]
      default: "interactive"

    repos:
      type: array
      items:
        type: object
      maxItems: 1  # Background mode: 1 repo limit (FR-017)
      minItems: 1

    timeout:
      type: integer
      minimum: 60      # Minimum 1 minute
      maximum: 3600    # Maximum 1 hour for background mode (FR-017)

    interactive:
      type: boolean
      # Custom validation: Must be false if mode == "background" (webhook validation)

    autoPushOnComplete:
      type: boolean
      # Custom validation: Must be true if mode == "background" (webhook validation)
```

**State Transitions**:

```
                    ┌─────────────┐
                    │   Pending   │ (Initial state after CR creation)
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Creating   │ (Operator creates Job + ServiceAccount)
                    └──────┬──────┘
                           │
                           ▼
                    ┌─────────────┐
             ┌──────│   Running   │◄──────┐
             │      └──────┬──────┘       │
             │             │              │
             │             │              │ (FR-008: Retry)
             ▼             ▼              │
      ┌──────────┐   ┌──────────┐        │
      │  Stopped │   │ Completed│        │
      └──────────┘   └──────────┘        │
                           │              │
                           ▼              │
                     ┌──────────┐  ┌──────────┐
                     │  Failed  │  │ Timeout  │
                     └─────┬────┘  └────┬─────┘
                           │            │
                           └────────────┘
```

**Terminal States**: `Completed`, `Failed`, `Stopped`, `Timeout` (FR-013: cancel support)

**Retry Behavior** (FR-008):
- When user retries failed task, backend creates NEW AgenticSession CR
- New CR has `metadata.annotations["ambient-code.io/retry-count"]` incremented
- Original failed CR remains for audit trail (FR-014)

---

### 2. TaskTemplate (NEW Custom Resource)

**Type**: New CRD
**API Group**: `vteam.ambient-code`
**API Version**: `v1alpha1`
**Scope**: Namespaced (project-scoped)

**Purpose**: Enable reusable task definitions (FR-010: create templates from successful tasks)

**Full CRD Spec**:

```yaml
apiVersion: vteam.ambient-code/v1alpha1
kind: TaskTemplate
metadata:
  name: "upgrade-lodash"
  namespace: "project-myproject"  # Project-scoped
  labels:
    ambient-code.io/category: "dependency-upgrade"  # Template categorization
    ambient-code.io/language: "javascript"          # Filter templates by language
spec:
  # Template metadata
  displayName: "Upgrade Lodash Dependency"
  description: "Upgrades lodash to a specified version and updates all imports"

  # Parameterized instructions
  instructionsTemplate: |
    Upgrade lodash to version {{version}} in package.json.
    Update all lodash imports to use the new API if there are breaking changes.
    Run npm install to update package-lock.json.
    Ensure all tests pass after the upgrade.

  # Template parameters
  parameters:
    - name: "version"
      type: "string"
      required: true
      description: "Target lodash version (e.g., 4.17.21)"
      defaultValue: "latest"
      validationRegex: "^\\d+\\.\\d+\\.\\d+$|^latest$"  # SemVer or "latest"

    - name: "runTests"
      type: "boolean"
      required: false
      description: "Whether to run npm test after upgrade"
      defaultValue: "true"

  # Validation requirements
  validationRules:
    - "package.json must exist in repository root"
    - "npm must be installed"
    - "npm test must pass (if runTests == true)"

  # Usage tracking
  usageCount: 42
  lastUsed: "2025-11-12T10:00:00Z"

  # Audit fields
  createdBy: "user@example.com"
  createdAt: "2025-11-01T08:00:00Z"
```

**Field Descriptions**:

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `spec.displayName` | string | Yes | Human-readable template name for UI display |
| `spec.description` | string | Yes | Detailed description of what the template does |
| `spec.instructionsTemplate` | string | Yes | Parameterized instructions with `{{param}}` placeholders |
| `spec.parameters[]` | array | Yes | List of parameters for template instantiation |
| `spec.parameters[].name` | string | Yes | Parameter name (used in `{{name}}` placeholders) |
| `spec.parameters[].type` | string | Yes | Parameter type: `"string"`, `"boolean"`, `"integer"` |
| `spec.parameters[].required` | boolean | Yes | Whether parameter must be provided |
| `spec.parameters[].defaultValue` | string | No | Default value if parameter not provided |
| `spec.parameters[].validationRegex` | string | No | Regex pattern for string validation |
| `spec.validationRules[]` | array | No | Human-readable validation requirements |
| `spec.usageCount` | integer | No | Number of times template has been used |
| `spec.lastUsed` | string (RFC3339) | No | Timestamp of last template usage |
| `spec.createdBy` | string | No | User who created the template |

**Template Instantiation**:

```go
// Backend handler: Instantiate template with parameters
func InstantiateTemplate(templateId string, params map[string]interface{}) string {
    template := getTaskTemplate(templateId)
    instructions := template.Spec.InstructionsTemplate

    // Replace {{param}} placeholders
    for _, param := range template.Spec.Parameters {
        value := params[param.Name]
        if value == nil {
            value = param.DefaultValue
        }
        placeholder := fmt.Sprintf("{{%s}}", param.Name)
        instructions = strings.ReplaceAll(instructions, placeholder, fmt.Sprintf("%v", value))
    }

    return instructions
}

// Example usage:
// POST /api/projects/myproject/background-tasks
// {
//   "name": "upgrade-lodash-v1",
//   "templateId": "upgrade-lodash",
//   "parameters": {
//     "version": "4.17.21",
//     "runTests": true
//   }
// }
//
// Generated instructions:
// "Upgrade lodash to version 4.17.21 in package.json.
//  Update all lodash imports to use the new API if there are breaking changes.
//  Run npm install to update package-lock.json.
//  Ensure all tests pass after the upgrade."
```

---

## Relationships

```
┌──────────────────┐
│    Project       │ (Kubernetes Namespace)
│  (Namespace)     │
└────────┬─────────┘
         │
         │ contains (1:N)
         │
         ├────────────────────────────────────┐
         │                                    │
         ▼                                    ▼
┌──────────────────┐              ┌──────────────────┐
│  BackgroundTask  │              │  TaskTemplate    │
│ (AgenticSession) │              │    (NEW CRD)     │
└────────┬─────────┘              └─────────┬────────┘
         │                                   │
         │ references (N:1, optional)        │
         │                                   │
         └───────────────────────────────────┘
                  templateId

┌──────────────────┐
│  BackgroundTask  │
└────────┬─────────┘
         │
         │ creates (1:1)
         │
         ▼
┌──────────────────┐
│   Kubernetes     │
│      Job         │
└────────┬─────────┘
         │
         │ owns (1:1)
         │
         ▼
┌──────────────────┐
│   ServiceAccount │
│   + Token Secret │
└──────────────────┘

┌──────────────────┐
│  BackgroundTask  │
└────────┬─────────┘
         │
         │ creates (1:1)
         │
         ▼
┌──────────────────┐
│   GitHub PR      │ (External to Kubernetes)
└──────────────────┘
```

**Relationship Types**:

1. **Project → BackgroundTask** (1:N)
   - Each project namespace contains 0+ background tasks
   - Enforced by Kubernetes namespace scoping

2. **Project → TaskTemplate** (1:N)
   - Each project namespace contains 0+ task templates
   - Templates are project-scoped (not shared across projects)

3. **BackgroundTask → TaskTemplate** (N:1, optional)
   - Background task optionally references a template via `spec.templateId`
   - If template exists, instructions are generated from template + parameters
   - If template doesn't exist, task creation fails with 400 Bad Request

4. **BackgroundTask → Job** (1:1)
   - Operator creates exactly one Kubernetes Job per background task
   - Job has OwnerReference to BackgroundTask CR (cascading delete)

5. **BackgroundTask → GitHub PR** (1:1, external)
   - Runner creates exactly one PR per background task (if validation passes)
   - PR URL stored in `status.repos[].prUrl` field
   - PR contains metadata linking back to task (FR-009)

---

## Indexes and Queries

**Backend Label Selectors** (for efficient querying):

```go
// Find all background tasks for a user (concurrency check - FR-017)
labelSelector := fmt.Sprintf(
    "ambient-code.io/mode=background,ambient-code.io/creator=%s",
    username,
)
runningTasks := listAgenticSessions(namespace, labelSelector, statusFilter="Running")

// Find all tasks using a specific template
labelSelector := "ambient-code.io/template=upgrade-lodash"
tasksFromTemplate := listAgenticSessions(namespace, labelSelector)

// Find all failed tasks (for retry UI)
labelSelector := "ambient-code.io/mode=background"
failedTasks := listAgenticSessions(namespace, labelSelector, statusFilter="Failed")
```

**Frontend Query Patterns** (React Query):

```typescript
// List background tasks with filters
const { data: tasks } = useQuery({
  queryKey: ['background-tasks', project, { status, creator }],
  queryFn: () => fetchBackgroundTasks(project, { status, creator }),
  refetchInterval: 5000, // Poll every 5 seconds for running tasks
});

// Get task details with real-time updates
const { data: task } = useQuery({
  queryKey: ['background-task', project, taskName],
  queryFn: () => fetchBackgroundTask(project, taskName),
  refetchInterval: (data) => data?.status === 'Running' ? 5000 : false,
});

// List task templates
const { data: templates } = useQuery({
  queryKey: ['task-templates', project],
  queryFn: () => fetchTaskTemplates(project),
});
```

---

## Field Size Limits

**AgenticSession Extensions**:
- `status.logs`: 10KB max (truncate older logs, full logs in pod)
- `status.currentPhase`: 256 characters max
- `spec.mode`: 32 characters max (enum: 3 values)
- `spec.templateId`: 253 characters max (K8s resource name limit)

**TaskTemplate**:
- `spec.displayName`: 128 characters max
- `spec.description`: 1024 characters max
- `spec.instructionsTemplate`: 10KB max
- `spec.parameters[]`: 50 parameters max per template
- `spec.validationRules[]`: 20 rules max per template

**Justification**: Kubernetes etcd recommends <1MB per object. All entities well below limit.

---

## Data Retention

**Background Tasks** (deferred - NFR-006):
- Completed tasks: Retained for 30 days (configurable)
- Failed tasks: Retained for 90 days (debugging)
- Stopped tasks: Retained for 7 days
- Implementation: K8s CronJob purges old CRs daily

**Task Templates**:
- No automatic deletion (persist until manually deleted)
- Audit trail: `spec.usageCount` and `spec.lastUsed` track template usage

**GitHub PRs** (external):
- Controlled by GitHub, not ACP
- PR metadata preserved even if task CR deleted

---

## Migration Strategy

**Backward Compatibility**:
- Existing `AgenticSession` CRs without `spec.mode` field → default to `mode: "interactive"`
- Existing operator code checks for `spec.mode == "background"` to apply background-specific logic
- Frontend hides background tasks from interactive session list (filter by mode label)

**CRD Update Process**:
1. Update `agenticsessions-crd.yaml` with new `spec.mode` field (optional, default: "interactive")
2. Apply CRD update: `kubectl apply -f agenticsessions-crd.yaml`
3. Restart operator to recognize new field
4. No downtime for existing sessions (field is optional)

**TaskTemplate CRD Creation**:
1. Create new `tasktemplates-crd.yaml` file
2. Apply CRD: `kubectl apply -f tasktemplates-crd.yaml`
3. Deploy backend with TaskTemplate handlers
4. No impact on existing functionality (new feature)

---

## Example Data Flow

**User Journey: Create Background Task from Template**

1. **User selects template** (Frontend)
   ```
   GET /api/projects/myproject/task-templates
   Response: [{ name: "upgrade-lodash", displayName: "Upgrade Lodash", ... }]
   ```

2. **User fills parameters** (Frontend)
   ```
   Form: { version: "4.17.21", runTests: true }
   ```

3. **Backend instantiates template** (Backend API)
   ```
   POST /api/projects/myproject/background-tasks
   Request:
   {
     "name": "upgrade-lodash-myrepo",
     "templateId": "upgrade-lodash",
     "parameters": { "version": "4.17.21" },
     "repository": { "url": "https://github.com/myorg/myrepo", "branch": "main" }
   }

   Backend Logic:
   1. Fetch TaskTemplate CR "upgrade-lodash"
   2. Instantiate instructions from template + parameters
   3. Check concurrency limit (user has no running tasks)
   4. Create AgenticSession CR with mode="background"
   ```

4. **Operator creates Job** (Operator)
   ```
   Watch Event: AgenticSession created with mode="background"
   Operator Logic:
   1. Provision ServiceAccount + RBAC Role + Token Secret
   2. Create Job with activeDeadlineSeconds=3600 (1 hour timeout)
   3. Update status.phase = "Creating"
   ```

5. **Runner executes task** (Python Runner)
   ```
   Runner Logic:
   1. Clone repository (progress: 20%)
   2. Execute Claude Code with instructions (progress: 60%)
   3. Run validation: npm run lint && npm test (progress: 80%)
   4. Push changes to fork (progress: 90%)
   5. Create GitHub PR via API (progress: 100%)
   6. Update CR status with PR URL
   ```

6. **User views result** (Frontend)
   ```
   GET /api/projects/myproject/background-tasks/upgrade-lodash-myrepo
   Response:
   {
     "name": "upgrade-lodash-myrepo",
     "status": "Completed",
     "progress": 100,
     "prUrl": "https://github.com/myorg/myrepo/pull/123",
     "logs": "Cloning repo...\nRunning linters...\nAll checks passed!\n"
   }
   ```

---

## Appendix: CRD YAML Snippets

**AgenticSession CRD Extension** (`agenticsessions-crd.yaml`):

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: agenticsessions.vteam.ambient-code
spec:
  # ... existing CRD metadata
  versions:
  - name: v1alpha1
    schema:
      openAPIV3Schema:
        properties:
          spec:
            properties:
              mode:  # NEW FIELD
                type: string
                enum: ["interactive", "batch", "background"]
                default: "interactive"
                description: "Execution mode: interactive, batch, or background"

              templateId:  # NEW FIELD
                type: string
                maxLength: 253
                description: "Optional reference to TaskTemplate for reusable patterns"

              # ... existing spec fields (prompt, repos, timeout, etc.)

          status:
            properties:
              progress:  # NEW FIELD
                type: integer
                minimum: 0
                maximum: 100
                description: "Task completion percentage for background mode"

              currentPhase:  # NEW FIELD
                type: string
                maxLength: 256
                description: "Human-readable description of current execution phase"

              logs:  # NEW FIELD
                type: string
                maxLength: 10240  # 10KB
                description: "Execution log buffer (last 10KB)"

              retryCount:  # NEW FIELD
                type: integer
                minimum: 0
                description: "Number of times task has been retried"

              repos:
                items:
                  properties:
                    prUrl:  # NEW FIELD
                      type: string
                      description: "GitHub/GitLab PR URL if created"
                    # ... existing repo status fields
```

**TaskTemplate CRD** (`tasktemplates-crd.yaml`):

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: tasktemplates.vteam.ambient-code
spec:
  group: vteam.ambient-code
  versions:
  - name: v1alpha1
    served: true
    storage: true
    schema:
      openAPIV3Schema:
        type: object
        properties:
          spec:
            type: object
            required: ["displayName", "instructionsTemplate", "parameters"]
            properties:
              displayName:
                type: string
                maxLength: 128
              description:
                type: string
                maxLength: 1024
              instructionsTemplate:
                type: string
                maxLength: 10240  # 10KB
              parameters:
                type: array
                maxItems: 50
                items:
                  type: object
                  required: ["name", "type", "required"]
                  properties:
                    name:
                      type: string
                    type:
                      type: string
                      enum: ["string", "boolean", "integer"]
                    required:
                      type: boolean
                    defaultValue:
                      type: string
                    validationRegex:
                      type: string
              validationRules:
                type: array
                maxItems: 20
                items:
                  type: string
              usageCount:
                type: integer
                minimum: 0
              lastUsed:
                type: string
                format: date-time
              createdBy:
                type: string
              createdAt:
                type: string
                format: date-time
  scope: Namespaced
  names:
    plural: tasktemplates
    singular: tasktemplate
    kind: TaskTemplate
    shortNames:
    - tt
```

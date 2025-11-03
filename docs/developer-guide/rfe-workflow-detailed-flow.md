# RFE Workflow: What Happens When You Hit Enter

**A Developer's Guide to the vTeam Guided RFE Workspace Process**

This document provides a detailed, phase-by-phase breakdown of what happens behind the scenes when you work with RFE (Request For Enhancement) workflows in vTeam. For each "enter" moment, we'll trace the complete journey from your browser through the API, Kubernetes, GitHub, and back.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Phase 1: Create RFE Workspace](#phase-1-create-rfe-workspace)
- [Phase 2: Check Seeding Status](#phase-2-check-seeding-status)
- [Phase 3: Seed Repository](#phase-3-seed-repository)
- [Phase 4: Specify Phase (spec.md)](#phase-4-specify-phase-specmd)
- [Phase 5: Plan Phase (plan.md)](#phase-5-plan-phase-planmd)
- [Phase 6: Tasks Phase (tasks.md)](#phase-6-tasks-phase-tasksmd)
- [Phase 7: Implementation Phase](#phase-7-implementation-phase)
- [Phase 8: Review Phase](#phase-8-review-phase)
- [Data Storage Locations](#data-storage-locations)
- [Key Architecture Insights](#key-architecture-insights)

---

## Architecture Overview

The RFE workflow is **git-native and spec-driven**, using GitHub as the single source of truth rather than maintaining internal workspace state.

### Core Components

```
┌─────────────────┐
│  Your Browser   │  NextJS Frontend (React Query, Shadcn UI)
└────────┬────────┘
         │ HTTPS
         ↓
┌─────────────────┐
│  Backend API    │  Go + Gin (User token auth, RBAC)
└────────┬────────┘
         │ K8s API
         ↓
┌─────────────────┐
│  Kubernetes     │  RFEWorkflow CR, AgenticSession CR
└────────┬────────┘
         │ Watch
         ↓
┌─────────────────┐
│  Operator       │  Standard AgenticSession operator (no RFE-specific operator)
└────────┬────────┘
         │ Creates Job
         ↓
┌─────────────────┐
│  Runner Pod     │  Claude Code SDK, Git operations
└────────┬────────┘
         │ Push
         ↓
┌─────────────────┐
│  GitHub         │  Feature branch, spec files (SOURCE OF TRUTH)
└─────────────────┘
```

### Key Difference from Standard Sessions

- **RFE Workflows**: No dedicated operator, git-native, phase-based, multi-repo support
- **Standard Sessions**: Operator creates pods, PVC workspace, single execution

---

## Phase 1: Create RFE Workspace

### 💻 Your Workstation

**Location**: `/projects/{projectName}/rfe/new`

**You fill out the form**:
- **Title**: "User Authentication System"
- **Description**: Detailed requirements
- **Branch Name**: Auto-generated as `ambient-user-authentication` (editable)
- **Spec Repo** (umbrella): `https://github.com/myorg/specs` + base branch `main`
- **Supporting Repos** (optional): `https://github.com/myorg/backend` + base branch `main`
- **Parent Outcome** (optional): Jira key like `RHASTRAT-456`

**You click "Create Workspace"**

---

### 🌐 API Call

```
POST /api/projects/my-project/rfe-workflows
Content-Type: application/json
Authorization: Bearer {your-token}

{
  "title": "User Authentication System",
  "description": "Implement JWT-based authentication with OAuth2 integration...",
  "branchName": "ambient-user-authentication",
  "umbrellaRepo": {
    "url": "https://github.com/myorg/specs",
    "branch": "main"
  },
  "supportingRepos": [
    {
      "url": "https://github.com/myorg/backend",
      "branch": "main"
    }
  ],
  "parentOutcome": "RHASTRAT-456"
}
```

**File**: `components/backend/handlers/rfe.go:142-189` (CreateProjectRFEWorkflow)

---

### ⚙️ Backend Processing

**Step 1: User Authentication** (line 181)
```go
reqK8s, reqDyn := GetK8sClientsForRequest(c)
if reqK8s == nil {
    return 401 Unauthorized  // Invalid or missing token
}
```
- Uses **your** Kubernetes token (not backend service account)
- Validates you have access to the project namespace

**Step 2: Validate Branch Name** (lines 157-161)
```go
ValidateBranchName("ambient-user-authentication")
// ✓ Not empty
// ✓ Not "main", "master", or "develop"
```

**Step 3: Validate Repository URLs** (lines 164-167)
```go
validateUniqueRepositories(umbrellaRepo, supportingRepos)
// ✓ No duplicates between umbrella and supporting repos
// Normalizes: lowercase, trim, remove .git suffix
```

**Step 4: Generate Workflow ID** (line 152)
```go
workflowID := fmt.Sprintf("rfe-%d", time.Now().Unix())
// Example: "rfe-1699564821"
```

**Step 5: Create Kubernetes Custom Resource** (line 182)
```go
// Uses BACKEND service account (elevated permissions)
UpsertProjectRFEWorkflowCR(DynamicClient, workflow)
```

---

### 💾 Kubernetes Resource Created

```yaml
apiVersion: vteam.ambient-code/v1alpha1
kind: RFEWorkflow
metadata:
  name: rfe-1699564821
  namespace: my-project
  labels:
    project: my-project
spec:
  title: "User Authentication System"
  description: "Implement JWT-based authentication..."
  branchName: "ambient-user-authentication"
  umbrellaRepo:
    url: "https://github.com/myorg/specs"
    branch: "main"
  supportingRepos:
    - url: "https://github.com/myorg/backend"
      branch: "main"
  workspacePath: ""  # Not used - Git is source of truth
  parentOutcome: "RHASTRAT-456"
status:
  phase: "Initializing"
  message: ""
```

**Storage**: Kubernetes etcd (cluster database)

---

### ✅ Response to Browser

```json
{
  "id": "rfe-1699564821",
  "title": "User Authentication System",
  "branchName": "ambient-user-authentication",
  "umbrellaRepo": {
    "url": "https://github.com/myorg/specs",
    "branch": "main"
  },
  "supportingRepos": [...],
  "createdAt": "2024-11-09T15:20:21Z"
}
```

**Frontend action**: Redirects to `/projects/my-project/rfe/rfe-1699564821`

---

### 🗂️ Data Storage After This Phase

| Location | Data | Notes |
|----------|------|-------|
| 💾 **Kubernetes etcd** | RFEWorkflow CR | Metadata only, no files yet |
| 🐙 **GitHub** | *(none)* | No branches or commits yet |
| 💻 **Your Browser** | Cached workflow object | React Query cache |

---

## Phase 2: Check Seeding Status

### 💻 Your Workstation

**Location**: `/projects/my-project/rfe/rfe-1699564821`

**Page loads automatically**:
- Frontend displays workflow details
- **Automatic seeding check** triggers (no button press needed)

---

### 🌐 API Call

```
GET /api/projects/my-project/rfe-workflows/rfe-1699564821/check-seeding
Authorization: Bearer {your-token}
```

**File**: `components/backend/handlers/rfe.go:424-517` (CheckProjectRFEWorkflowSeeding)

---

### ⚙️ Backend Processing

**Step 1: Fetch GitHub Token**
```go
// Try user's GitHub App installation token first
token := GetGitHubTokenForUser(userID, repoURL)

// Fallback to project GIT_TOKEN secret
if token == "" {
    token = GetProjectGitTokenSecret(namespace)
}
```

**Step 2: Check Umbrella Repo Seeding** (via GitHub API)

Checks for these paths using `GET /repos/{owner}/{repo}/contents/{path}`:
- `.claude/` directory ✓ or ✗
- `.claude/commands/` directory ✓ or ✗
- `.claude/agents/` directory ✓ or ✗
- `.specify/` directory ✓ or ✗

**Step 3: Check Supporting Repos**

For each supporting repo, checks if feature branch exists:
```
GET /repos/{owner}/{repo}/git/ref/heads/ambient-user-authentication
```

---

### ✅ Response to Browser

```json
{
  "isSeeded": false,
  "specRepo": {
    "isSeeded": false,
    "details": {
      "claudeExists": false,
      "claudeCommandsExists": false,
      "claudeAgentsExists": false,
      "specifyExists": false
    }
  },
  "supportingRepos": [
    {
      "repoURL": "https://github.com/myorg/backend",
      "branchExists": false
    }
  ]
}
```

---

### 💻 Your Workstation (UI Updates)

**You see**:
```
⚠️ Spec Repository Not Seeded

This workspace requires repository seeding before you can begin work.

Seeding will:
✓ Set up the feature branch 'ambient-user-authentication'
✓ Add Spec-Kit template files and slash commands
✓ Add agent definitions for the RFE council
✓ Create the specs/ambient-user-authentication/ directory

[Edit Repositories]  [Seed Repository]
```

**You click "Seed Repository"**

---

### 🗂️ Data Storage After This Phase

| Location | Data | Notes |
|----------|------|-------|
| 💾 **Kubernetes etcd** | RFEWorkflow CR | Unchanged |
| 🐙 **GitHub** | *(none)* | Still no changes |
| 💻 **Your Browser** | Seeding status | Cached for 30s (React Query) |

---

## Phase 3: Seed Repository

**This is the most complex operation in the entire RFE workflow.** It performs direct Git operations on multiple repositories.

### 💻 Your Workstation

**You click "Seed Repository"**

**Optional modal appears** (can customize):
- Agent source repo (default: `github.com/ambient-code/vTeam`)
- Spec-Kit repo (default: `github/spec-kit`)
- Template name (default: `spec-kit-template-claude-sh`)

**You confirm**

---

### 🌐 API Call

```
POST /api/projects/my-project/rfe-workflows/rfe-1699564821/seed
Authorization: Bearer {your-token}
Content-Type: application/json

{
  "agentSourceUrl": "https://github.com/ambient-code/vTeam",
  "agentSourceBranch": "main",
  "agentSourcePath": "agents",
  "specKitRepo": "github/spec-kit",
  "specKitVersion": "main",
  "specKitTemplate": "spec-kit-template-claude-sh"
}
```

**File**: `components/backend/handlers/rfe.go:300-421` (SeedProjectRFEWorkflow)

---

### ⚙️ Backend Processing (Seeding Operation)

**File**: `components/backend/git/operations.go:295-648` (PerformRepoSeeding)

This runs on the **backend server**, NOT in a pod.

---

#### **Step 1: Pre-Flight Validation** (lines 308-323)

Validates **push access** to all repos via GitHub API:

```
GET /repos/myorg/specs/collaborators/{username}/permission
→ 200 OK: { "permission": "admin" } ✓

GET /repos/myorg/backend/collaborators/{username}/permission
→ 200 OK: { "permission": "write" } ✓
```

**If any fail**:
```json
{
  "error": "you don't have push access to https://github.com/myorg/backend. Please fork the repository or use a repository you have write access to."
}
```

---

#### **Step 2: Clone Umbrella Repo** (lines 325-364)

**On backend server filesystem**:

```bash
# Create temp directory
mkdir /tmp/umbrella-rfe-1699564821-abc123

# Verify base branch exists
git ls-remote --heads https://github.com/myorg/specs main
# → refs/heads/main ✓

# Clone with authentication
git clone --depth 1 --branch main \
  https://x-access-token:{github-token}@github.com/myorg/specs \
  /tmp/umbrella-rfe-1699564821-abc123

# Configure git identity
cd /tmp/umbrella-rfe-1699564821-abc123
git config user.email "vteam-bot@ambient-code.io"
git config user.name "vTeam Bot"
```

---

#### **Step 3: Feature Branch Handling** (lines 376-416)

**Check if branch exists remotely**:

```bash
git ls-remote --heads origin ambient-user-authentication
```

**Case A: Branch exists** ✓
```bash
git fetch --depth 1 origin ambient-user-authentication:ambient-user-authentication
git checkout ambient-user-authentication
# ⚠️ Log: "Branch 'ambient-user-authentication' already existed and will be modified by this RFE"
```

**Case B: Branch doesn't exist** (most common)
```bash
git checkout -b ambient-user-authentication
# ✓ Creates new branch from main
```

---

#### **Step 4: Download and Extract Spec-Kit** (lines 418-547)

**Download Spec-Kit ZIP**:

```bash
# For releases (version starts with 'v')
curl -L https://github.com/github/spec-kit/releases/download/main/spec-kit-template-claude-sh-main.zip \
  -o /tmp/spec-kit.zip

# OR for branches (version is branch name)
curl -L https://github.com/github/spec-kit/archive/refs/heads/main.zip \
  -o /tmp/spec-kit.zip
```

**Extract ONLY these paths** (selective extraction):

```
templates/commands/*.md         → .claude/commands/speckit.*.md
scripts/bash/*                  → .specify/scripts/bash/*
templates/*.md                  → .specify/templates/*.md
memory/*                        → .specify/memory/*
```

**Skipped paths**:
- `docs/` (documentation)
- `media/` (images, videos)
- `.github/` (GitHub Actions)
- `scripts/powershell/` (Windows scripts)
- Root-level files

**Permissions set**:
```bash
chmod 0755 .specify/scripts/bash/*  # Executable
chmod 0644 .claude/commands/*       # Read/write
chmod 0644 .specify/templates/*     # Read/write
chmod 0644 .specify/memory/*        # Read/write
```

**Files created** (example):
```
.claude/commands/
├── speckit.specify.md     # /specify slash command
├── speckit.plan.md        # /plan slash command
├── speckit.tasks.md       # /tasks slash command
└── speckit.constitution.md

.specify/
├── scripts/bash/
│   ├── spec_update.sh
│   └── plan_update.sh
├── templates/
│   ├── spec-template.md
│   ├── plan-template.md
│   └── tasks-template.md
└── memory/
    ├── spec-principles.md
    └── workflow-state.md
```

---

#### **Step 5: Clone and Copy Agents** (lines 549-596)

**Clone agent source repo**:

```bash
mkdir /tmp/agents-xyz
git clone --depth 1 --branch main \
  https://github.com/ambient-code/vTeam \
  /tmp/agents-xyz
```

**Copy agent definitions**:

```bash
# Walk agents/ directory
cp /tmp/agents-xyz/agents/*.md .claude/agents/
```

**Files created**:
```
.claude/agents/
├── product-manager.md      # Parker
├── architect.md            # Archie
├── staff-engineer.md       # Stella
├── product-owner.md        # Olivia
├── team-lead.md            # Lee
├── team-member.md          # Taylor
└── delivery-owner.md       # Jack
```

---

#### **Step 6: Create Specs Directory** (lines 598-603)

```bash
mkdir -p specs/ambient-user-authentication
```

**Directory structure**:
```
specs/
└── ambient-user-authentication/
    # Empty - ready for spec.md, plan.md, tasks.md
```

---

#### **Step 7: Commit and Push** (lines 605-632)

```bash
git add .

# Check if there are changes
git diff --cached --quiet
# Returns exit code 1 if changes exist ✓

git commit -m "chore: initialize ambient-user-authentication with spec-kit and agents"
# [ambient-user-authentication abc123d] chore: initialize...

git push -u origin ambient-user-authentication
# → To https://github.com/myorg/specs
#    * [new branch] ambient-user-authentication -> ambient-user-authentication
```

**Log**:
```
✓ Successfully seeded umbrella repo on branch ambient-user-authentication
```

---

#### **Step 8: Seed Supporting Repos** (lines 634-645)

**File**: `components/backend/git/operations.go:1064-1137`

For each supporting repo:

```bash
# Clone
mkdir /tmp/supporting-backend-xyz
git clone --depth 1 --branch main \
  https://x-access-token:{token}@github.com/myorg/backend \
  /tmp/supporting-backend-xyz

cd /tmp/supporting-backend-xyz
git config user.email "vteam-bot@ambient-code.io"
git config user.name "vTeam Bot"

# Check if branch exists
git ls-remote --heads origin ambient-user-authentication

# If doesn't exist, create and push
git checkout -b ambient-user-authentication
git push -u origin ambient-user-authentication
# → * [new branch] ambient-user-authentication -> ambient-user-authentication
```

**No spec-kit or agents added** - only the feature branch is created.

---

### ✅ Response to Browser

```json
{
  "status": "completed",
  "message": "Repository seeded successfully",
  "branchName": "ambient-user-authentication",
  "branchExisted": false
}
```

---

### 💻 Your Workstation (UI Updates)

**Status polling** (every 5 seconds until seeded):
```
GET /api/projects/my-project/rfe-workflows/rfe-1699564821/check-seeding
```

**Once seeded**, UI shows:
```
✓ Spec Repository Seeded

Your workspace is ready for specification work.

Current Phase: specify

[Create Session to Start Work]
```

---

### 🗂️ Data Storage After This Phase

| Location | Data | Notes |
|----------|------|-------|
| 💾 **Kubernetes etcd** | RFEWorkflow CR | Unchanged (no status update) |
| 🐙 **GitHub (specs repo)** | Feature branch `ambient-user-authentication` | `.claude/`, `.specify/`, `specs/{branch}/` |
| 🐙 **GitHub (backend repo)** | Feature branch `ambient-user-authentication` | Empty branch from `main` |
| 💻 **Backend Server** | Temp dirs deleted | `/tmp/umbrella-*`, `/tmp/agents-*` cleaned up |

---

## Phase 4: Specify Phase (spec.md)

**Goal**: Create `specs/ambient-user-authentication/spec.md` using AI agents.

### 💻 Your Workstation

**Location**: `/projects/my-project/rfe/rfe-1699564821`

**You see**:
```
┌─────────────────────────────────────────────────┐
│ Specification Phase                             │
│ Status: Not Started                             │
│                                                 │
│ Create a detailed specification document for    │
│ your feature using the /specify command.        │
│                                                 │
│ [Create Specification Session]                  │
└─────────────────────────────────────────────────┘
```

**You click "Create Specification Session"**

---

### 🌐 API Call (Create Session)

```
POST /api/projects/my-project/agentic-sessions
Authorization: Bearer {your-token}
Content-Type: application/json

{
  "prompt": "Create a detailed specification for a user authentication system. Use the /specify command to guide the process. The spec should cover JWT-based auth, OAuth2 integration, session management, and security requirements.",
  "repos": [
    {
      "input": {
        "url": "https://github.com/myorg/specs",
        "branch": "ambient-user-authentication"
      },
      "output": {
        "url": "https://github.com/myorg/specs",
        "targetBranch": "ambient-user-authentication",
        "autoCommit": true
      }
    },
    {
      "input": {
        "url": "https://github.com/myorg/backend",
        "branch": "ambient-user-authentication"
      }
      // No output - read-only reference
    }
  ],
  "mainRepoIndex": 0,  // specs repo is working directory
  "model": "claude-sonnet-4-5",
  "timeout": 1800,
  "metadata": {
    "rfeWorkflow": "rfe-1699564821",
    "rfePhase": "specify"
  }
}
```

**File**: `components/backend/handlers/sessions.go:153-490` (CreateSession)

---

### ⚙️ Backend Processing (Create AgenticSession)

**Step 1: User Authentication**
```go
reqK8s, reqDyn := GetK8sClientsForRequest(c)
// Uses YOUR token
```

**Step 2: Validate Multi-Repo Input**
```go
ValidateRepoConfigs(repos)
// ✓ mainRepoIndex in bounds
// ✓ Input URLs valid
// ✓ Output configurations valid
```

**Step 3: Generate Session ID**
```go
sessionID := GenerateSessionID()  // e.g., "session-abc123xyz"
```

**Step 4: Create AgenticSession CR**
```go
// Uses BACKEND service account for CR write
DynamicClient.Resource(gvr).Namespace(project).Create(ctx, obj, v1.CreateOptions{})
```

---

### 💾 Kubernetes Resource Created

```yaml
apiVersion: vteam.ambient-code/v1alpha1
kind: AgenticSession
metadata:
  name: session-abc123xyz
  namespace: my-project
  labels:
    project: my-project
    rfe-workflow: rfe-1699564821  # Links to RFE
    rfe-phase: specify            # Which phase
spec:
  prompt: "Create a detailed specification..."
  repos:
    - input:
        url: "https://github.com/myorg/specs"
        branch: "ambient-user-authentication"
      output:
        url: "https://github.com/myorg/specs"
        targetBranch: "ambient-user-authentication"
        autoCommit: true
    - input:
        url: "https://github.com/myorg/backend"
        branch: "ambient-user-authentication"
  mainRepoIndex: 0
  model: "claude-sonnet-4-5"
  timeout: 1800
  interactive: false
status:
  phase: "Pending"
  startTime: null
  completionTime: null
```

**Storage**: Kubernetes etcd

---

### ⚙️ Operator Processing (Watch Loop)

**File**: `components/operator/internal/handlers/sessions.go`

**Operator watches** for AgenticSession CRs in phase "Pending":

```go
watcher, _ := DynamicClient.Resource(gvr).Watch(ctx, v1.ListOptions{})

for event := range watcher.ResultChan() {
    if event.Type == watch.Added || event.Type == watch.Modified {
        obj := event.Object.(*unstructured.Unstructured)
        phase := obj.Status.Phase

        if phase == "Pending" {
            CreateJobForSession(obj)  // ← Triggers pod creation
        }
    }
}
```

---

### 🚀 Job and Pod Creation

**Operator creates Kubernetes Job**:

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: session-abc123xyz
  namespace: my-project
  ownerReferences:
    - apiVersion: vteam.ambient-code/v1alpha1
      kind: AgenticSession
      name: session-abc123xyz
      uid: ...
      controller: true
spec:
  template:
    spec:
      serviceAccountName: vteam-runner  # Has limited K8s permissions
      securityContext:
        runAsNonRoot: true
        fsGroup: 1000
      containers:
        - name: claude-runner
          image: quay.io/ambient_code/vteam_claude_runner:latest
          env:
            - name: SESSION_NAME
              value: "session-abc123xyz"
            - name: SESSION_NAMESPACE
              value: "my-project"
            - name: ANTHROPIC_API_KEY
              valueFrom:
                secretKeyRef:
                  name: project-secrets
                  key: ANTHROPIC_API_KEY
            - name: GIT_TOKEN
              valueFrom:
                secretKeyRef:
                  name: project-secrets
                  key: GIT_TOKEN
            - name: BACKEND_URL
              value: "http://vteam-backend-service:8080"
          volumeMounts:
            - name: workspace
              mountPath: /workspace
      volumes:
        - name: workspace
          persistentVolumeClaim:
            claimName: session-abc123xyz-pvc
      restartPolicy: Never
```

**Pod starts** on Kubernetes cluster node.

---

### 🤖 Inside Runner Pod

**File**: `components/runners/claude-code-runner/claude_code_runner/__main__.py`

---

#### **Step 1: Fetch Session CR**

```python
import os
from kubernetes import client, config

config.load_incluster_config()  # Use pod service account
k8s_client = client.CustomObjectsApi()

session = k8s_client.get_namespaced_custom_object(
    group="vteam.ambient-code",
    version="v1alpha1",
    namespace="my-project",
    plural="agenticsessions",
    name="session-abc123xyz"
)

prompt = session["spec"]["prompt"]
repos = session["spec"]["repos"]
main_repo_index = session["spec"].get("mainRepoIndex", 0)
```

---

#### **Step 2: Clone Repositories**

```python
import subprocess

GIT_TOKEN = os.environ["GIT_TOKEN"]
WORKSPACE = "/workspace"

# Clone repo 0 (umbrella/specs) - main working directory
auth_url = f"https://x-access-token:{GIT_TOKEN}@github.com/myorg/specs"
subprocess.run([
    "git", "clone",
    "-b", "ambient-user-authentication",
    auth_url,
    f"{WORKSPACE}/specs"
])

# Clone repo 1 (backend) - supporting repo
auth_url = f"https://x-access-token:{GIT_TOKEN}@github.com/myorg/backend"
subprocess.run([
    "git", "clone",
    "-b", "ambient-user-authentication",
    auth_url,
    f"{WORKSPACE}/backend"
])

# Configure git identity
subprocess.run(["git", "config", "--global", "user.email", "vteam-bot@ambient-code.io"])
subprocess.run(["git", "config", "--global", "user.name", "vTeam Bot"])
```

**Filesystem state**:
```
/workspace/
├── specs/                          # Working directory (mainRepoIndex=0)
│   ├── .claude/
│   │   ├── commands/
│   │   │   ├── speckit.specify.md  # /specify command available
│   │   │   └── ...
│   │   └── agents/
│   │       ├── product-manager.md
│   │       └── ...
│   ├── .specify/
│   │   ├── scripts/bash/
│   │   ├── templates/
│   │   └── memory/
│   └── specs/ambient-user-authentication/  # Empty - ready for spec.md
│
└── backend/                        # Reference repo
    └── (source code)
```

---

#### **Step 3: Initialize Claude Code SDK**

```python
from claude_code import ClaudeCode

session = ClaudeCode(
    working_directory="/workspace/specs",  # Main repo
    api_key=os.environ["ANTHROPIC_API_KEY"],
    model="claude-sonnet-4-5",
    max_conversation_turns=50
)

# Claude Code SDK discovers:
# - .claude/commands/*.md (slash commands)
# - .claude/agents/*.md (agent personas)
```

---

#### **Step 4: Execute Prompt**

```python
result = session.send_message(
    "Create a detailed specification for a user authentication system. "
    "Use the /specify command to guide the process. The spec should cover "
    "JWT-based auth, OAuth2 integration, session management, and security requirements."
)
```

---

#### **Step 5: Claude Code Execution**

**Claude Code has access to**:
- `/workspace/specs` (can read/write files)
- `/workspace/backend` (can read files, understand existing code)
- Bash commands
- Git operations
- Slash commands from `.claude/commands/`

**Claude Code might**:

1. **Execute /specify slash command**:
   ```
   /specify
   ```
   - Reads `.claude/commands/speckit.specify.md`
   - Loads spec template from `.specify/templates/spec-template.md`
   - Reads spec principles from `.specify/memory/spec-principles.md`

2. **Read backend code** for context:
   ```bash
   grep -r "authentication" /workspace/backend/src
   cat /workspace/backend/src/auth/jwt.go
   ```

3. **Create specification file**:
   ```bash
   cat > /workspace/specs/specs/ambient-user-authentication/spec.md <<'EOF'
   # User Authentication System Specification

   ## Overview
   Implement a secure, JWT-based authentication system with OAuth2 integration
   for the myorg platform.

   ## Requirements

   ### Functional Requirements
   1. **JWT Authentication**
      - Issue JWT tokens upon successful login
      - Token expiration: 1 hour
      - Refresh token support: 30-day expiry

   2. **OAuth2 Integration**
      - Support GitHub OAuth
      - Support Google OAuth
      - Extensible provider architecture

   ### Security Requirements
   1. Password hashing using bcrypt (cost factor 12)
   2. Rate limiting: 5 failed login attempts per 15 minutes
   3. HTTPS only for token transmission

   ## Architecture
   [Detailed architecture section...]

   ## API Design
   [API endpoints, request/response schemas...]

   ## Implementation Plan
   [High-level implementation steps...]
   EOF
   ```

4. **Show file to user** (streamed output):
   ```
   Created specification file: specs/ambient-user-authentication/spec.md

   The specification includes:
   ✓ Functional requirements for JWT and OAuth2
   ✓ Security requirements and threat model
   ✓ API design with endpoints
   ✓ Data models and schemas
   ```

---

#### **Step 6: Auto-Commit and Push**

Since `output.autoCommit: true`:

```python
import subprocess

# Add files
subprocess.run([
    "git", "add",
    "specs/ambient-user-authentication/spec.md"
], cwd="/workspace/specs")

# Commit
subprocess.run([
    "git", "commit", "-m",
    "feat: add user authentication system specification\n\n"
    "Created comprehensive spec covering JWT auth, OAuth2, and security requirements."
], cwd="/workspace/specs")

# Push
subprocess.run([
    "git", "push", "origin", "ambient-user-authentication"
], cwd="/workspace/specs")
```

**Git log**:
```
commit def456g (origin/ambient-user-authentication, ambient-user-authentication)
Author: vTeam Bot <vteam-bot@ambient-code.io>
Date:   Fri Nov 9 15:35:42 2024 +0000

    feat: add user authentication system specification

    Created comprehensive spec covering JWT auth, OAuth2, and security requirements.

 specs/ambient-user-authentication/spec.md | 245 +++++++++++++++++++++++++++++++
 1 file changed, 245 insertions(+)
```

---

#### **Step 7: Update Session Status**

```python
# Get current session object
session_obj = k8s_client.get_namespaced_custom_object(...)

# Update status
session_obj["status"] = {
    "phase": "Completed",
    "startTime": "2024-11-09T15:30:00Z",
    "completionTime": "2024-11-09T15:36:15Z",
    "results": "Created specification document at specs/ambient-user-authentication/spec.md",
    "repos": [
        {
            "url": "https://github.com/myorg/specs",
            "pushed": True,
            "commitSha": "def456g",
            "error": None
        },
        {
            "url": "https://github.com/myorg/backend",
            "pushed": False,  # Read-only
            "commitSha": None,
            "error": None
        }
    ]
}

# Update status subresource
k8s_client.patch_namespaced_custom_object_status(...)
```

**Pod exits** with code 0 (success).

---

### ✅ Response Flow to Browser

**Frontend polls** session status (every 5 seconds):

```
GET /api/projects/my-project/agentic-sessions/session-abc123xyz
```

**Backend returns**:
```json
{
  "name": "session-abc123xyz",
  "spec": {
    "prompt": "Create a detailed specification...",
    ...
  },
  "status": {
    "phase": "Completed",
    "startTime": "2024-11-09T15:30:00Z",
    "completionTime": "2024-11-09T15:36:15Z",
    "results": "Created specification document...",
    "repos": [
      {
        "url": "https://github.com/myorg/specs",
        "pushed": true,
        "commitSha": "def456g"
      }
    ]
  }
}
```

---

### 💻 Your Workstation (UI Updates)

**Phase card updates automatically**:

```
┌─────────────────────────────────────────────────┐
│ Specification Phase                             │
│ Status: ✓ Completed                             │
│ Progress: 100%                                  │
│                                                 │
│ ✓ spec.md created                               │
│                                                 │
│ [View Specification] [View Session]             │
└─────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────┐
│ Planning Phase                                  │
│ Status: Not Started                             │
│                                                 │
│ Create a detailed implementation plan based on  │
│ your specification.                             │
│                                                 │
│ [Create Planning Session]                       │
└─────────────────────────────────────────────────┘
```

**"View Specification" button**:
- Fetches `specs/ambient-user-authentication/spec.md` from GitHub
- Renders markdown in browser

---

### 🗂️ Data Storage After This Phase

| Location | Data | Notes |
|----------|------|-------|
| 💾 **Kubernetes etcd** | AgenticSession CR (status: Completed) | Includes commit SHA |
| 💾 **Kubernetes etcd** | RFEWorkflow CR | Unchanged (no automatic update) |
| 🐙 **GitHub (specs repo)** | `specs/ambient-user-authentication/spec.md` | New commit on feature branch |
| 💻 **Pod Workspace** | *(deleted)* | PVC cleaned up after job completion |

---

## Phase 5: Plan Phase (plan.md)

**Goal**: Create `specs/ambient-user-authentication/plan.md` based on `spec.md`.

### Flow (Same as Specify Phase)

The flow is **identical** to Phase 4, except:

**Prompt changes**:
```json
{
  "prompt": "Create a detailed implementation plan in specs/ambient-user-authentication/plan.md. Reference the existing spec.md and use the /plan command to guide the process. Break down the implementation into phases, components, and tasks."
}
```

**Label changes**:
```yaml
metadata:
  labels:
    rfe-phase: "plan"  # ← Different phase
```

**Agent uses**:
- `/plan` slash command instead of `/specify`
- Reads `specs/ambient-user-authentication/spec.md` for context
- Creates `specs/ambient-user-authentication/plan.md`

**Git commit**:
```
commit ghi789j
Author: vTeam Bot <vteam-bot@ambient-code.io>
Date:   Fri Nov 9 16:05:22 2024 +0000

    feat: add implementation plan for authentication system

    Detailed plan with phases, components, and dependencies based on spec.md.

 specs/ambient-user-authentication/plan.md | 312 ++++++++++++++++++++++++
 1 file changed, 312 insertions(+)
```

---

## Phase 6: Tasks Phase (tasks.md)

**Goal**: Create `specs/ambient-user-authentication/tasks.md` breaking down `plan.md` into actionable tasks.

### Flow (Same as Specify and Plan)

**Prompt changes**:
```json
{
  "prompt": "Create a tasks breakdown in specs/ambient-user-authentication/tasks.md. Reference plan.md and spec.md. Use the /tasks command. Break the plan into specific, actionable tasks with dependencies, acceptance criteria, and story points."
}
```

**Label changes**:
```yaml
metadata:
  labels:
    rfe-phase: "tasks"  # ← Different phase
```

**Agent creates**:
```markdown
# Tasks Breakdown: User Authentication System

## Sprint 1: Foundation
### Task 1: Database Schema
- **Story Points**: 3
- **Dependencies**: None
- **Acceptance Criteria**:
  - [ ] Users table created
  - [ ] OAuth providers table created
  - [ ] Sessions table created
  - [ ] Migrations written

[... more tasks ...]
```

**Git commit**:
```
commit jkl012m
feat: add task breakdown for authentication system

Detailed tasks with dependencies, acceptance criteria, and story points.
```

---

## Phase 7: Implementation Phase

**Goal**: Actually write code in supporting repos based on tasks.md.

### 💻 Your Workstation

**You see**:
```
┌─────────────────────────────────────────────────┐
│ Implementation Phase                            │
│ Status: Not Started                             │
│                                                 │
│ Implement the features based on your tasks.md.  │
│ You can create multiple sessions to tackle      │
│ different tasks or components.                  │
│                                                 │
│ [Create Implementation Session]                 │
└─────────────────────────────────────────────────┘
```

**You click "Create Implementation Session"**

---

### 🌐 API Call (Different repos configuration)

```
POST /api/projects/my-project/agentic-sessions
{
  "prompt": "Implement Task 1: Database Schema from specs/ambient-user-authentication/tasks.md. Create migration files and schema definitions in the backend repo.",
  "repos": [
    {
      "input": {
        "url": "https://github.com/myorg/specs",
        "branch": "ambient-user-authentication"
      }
      // NO output - read-only for context
    },
    {
      "input": {
        "url": "https://github.com/myorg/backend",
        "branch": "ambient-user-authentication"
      },
      "output": {
        "url": "https://github.com/myorg/backend",
        "targetBranch": "ambient-user-authentication",
        "autoCommit": true
      }
    }
  ],
  "mainRepoIndex": 1,  # ← backend is now working directory
  "metadata": {
    "rfeWorkflow": "rfe-1699564821",
    "rfePhase": "implement"
  }
}
```

**Key differences**:
- `mainRepoIndex: 1` - backend repo is working directory
- Specs repo is **read-only** (for reference)
- Backend repo has **output** configuration

---

### 🤖 Inside Runner Pod (Implementation)

**Filesystem**:
```
/workspace/
├── specs/                          # Read-only reference
│   └── specs/ambient-user-authentication/
│       ├── spec.md                 # Claude reads for context
│       ├── plan.md                 # Claude reads for context
│       └── tasks.md                # Claude reads for what to build
│
└── backend/                        # Working directory
    ├── migrations/                 # Claude writes here
    ├── src/
    │   ├── models/                 # Claude writes here
    │   └── auth/                   # Claude writes here
    └── tests/                      # Claude writes here
```

**Claude Code executes**:
1. Reads `tasks.md` to understand Task 1 requirements
2. Reads `spec.md` for schema details
3. Creates migration files:
   ```sql
   -- migrations/001_create_users_table.sql
   CREATE TABLE users (
     id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
     email VARCHAR(255) UNIQUE NOT NULL,
     password_hash VARCHAR(255) NOT NULL,
     created_at TIMESTAMP DEFAULT NOW(),
     updated_at TIMESTAMP DEFAULT NOW()
   );
   ```
4. Creates model files in `src/models/user.go`
5. Writes tests in `tests/models/user_test.go`
6. Commits and pushes to backend repo

**Git commit (backend repo)**:
```
commit nop345q (origin/ambient-user-authentication)
Author: vTeam Bot <vteam-bot@ambient-code.io>
Date:   Fri Nov 9 17:15:30 2024 +0000

    feat: implement database schema for authentication

    - Add users table migration
    - Add oauth_providers table migration
    - Add sessions table migration
    - Implement User model
    - Add comprehensive tests

 migrations/001_create_users_table.sql    | 12 ++++++
 migrations/002_create_oauth_providers.sql | 10 +++++
 migrations/003_create_sessions.sql        | 11 +++++
 src/models/user.go                        | 45 +++++++++++++++++++
 tests/models/user_test.go                 | 82 ++++++++++++++++++++++++++++++++
 5 files changed, 160 insertions(+)
```

---

### 🗂️ Data Storage After Implementation

| Location | Data | Notes |
|----------|------|-------|
| 💾 **Kubernetes etcd** | AgenticSession CR (status: Completed) | Multiple sessions |
| 🐙 **GitHub (specs repo)** | spec.md, plan.md, tasks.md | No changes in this phase |
| 🐙 **GitHub (backend repo)** | New code commits | Actual implementation |

---

## Phase 8: Review Phase

**Goal**: Code review, PR creation, testing.

### 💻 Your Workstation

**You create a review session**:

```json
{
  "prompt": "Review the authentication implementation. Check for security issues, code quality, test coverage. Create a PR summary highlighting the changes.",
  "repos": [
    {
      "input": {
        "url": "https://github.com/myorg/specs",
        "branch": "ambient-user-authentication"
      }
    },
    {
      "input": {
        "url": "https://github.com/myorg/backend",
        "branch": "ambient-user-authentication"
      }
    }
  ],
  "mainRepoIndex": 1,
  "metadata": {
    "rfeWorkflow": "rfe-1699564821",
    "rfePhase": "review"
  }
}
```

**Agent performs**:
- Security audit of auth code
- Test coverage analysis
- Code quality checks
- Generates PR description

**You manually create PR** (or agent can via GitHub API):
```
From: ambient-user-authentication
To: main

Title: feat: User Authentication System

[Agent-generated PR description with summary, testing notes, security considerations]
```

---

## Data Storage Locations

### Throughout the Workflow

| Storage | What's Stored | Lifecycle |
|---------|---------------|-----------|
| 💾 **Kubernetes etcd** | RFEWorkflow CR (metadata only) | Persists until deleted |
| 💾 **Kubernetes etcd** | AgenticSession CRs (one per phase) | Persists until deleted |
| 💾 **Kubernetes etcd** | Jobs (runner execution) | Cleaned up after completion |
| 💾 **Kubernetes etcd** | PVCs (workspace volumes) | Cleaned up after job completion |
| 🐙 **GitHub (specs repo)** | Feature branch with spec files | Persists, merged via PR |
| 🐙 **GitHub (supporting repos)** | Feature branch with implementation | Persists, merged via PR |
| 💻 **Backend Server** | Temp directories during seeding | Cleaned up immediately |
| 💻 **Runner Pod** | Cloned repos, work files | Deleted when pod terminates |
| 💻 **Your Browser** | React Query cache | Expires after 5 minutes |

---

## Key Architecture Insights

### 1. Git is the Source of Truth

**Not stored in Kubernetes**:
- Spec files (spec.md, plan.md, tasks.md)
- Implementation code
- Phase state (derived from file existence)

**Only stored in Kubernetes**:
- Workflow metadata (title, repos, branch name)
- Session execution state
- Labels linking sessions to RFE

### 2. No RFE-Specific Operator

- RFE workflows **reuse** the standard AgenticSession operator
- Linking via labels: `rfe-workflow=rfe-1699564821`, `rfe-phase=specify`
- No custom reconciliation loop for RFE

### 3. Branch-Centric Workflow

- All repos use the **same feature branch name**
- Feature branch is central identity
- Easy to track changes across repos

### 4. Phase Progression

**Frontend determines phase** by checking GitHub:
```python
if not spec.md exists:
    phase = "specify"
elif not plan.md exists:
    phase = "plan"
elif not tasks.md exists:
    phase = "tasks"
else:
    phase = "implement"  # or "review" based on context
```

### 5. Multi-Repo Support

- **Umbrella repo**: Contains specs, agents, spec-kit
- **Supporting repos**: Implementation code
- **mainRepoIndex**: Determines working directory (usually umbrella for spec work, supporting for implementation)

### 6. Spec-Kit Integration

- Spec-Kit provides **slash commands** for guided workflows
- Downloaded from GitHub releases/branches during seeding
- Copied to `.claude/commands/` and `.specify/`

### 7. Permission Model

- **Seeding**: Uses **user's GitHub token** (requires push access)
- **Session execution**: Uses **user's token OR project GIT_TOKEN**
- **CR writes**: Uses **backend service account**
- **CR reads**: Uses **user's Kubernetes token**

---

## Flow Diagram Legend

```
💻 Your Workstation       → Browser, UI interactions
🌐 API Call               → HTTP request to backend
⚙️  Backend Processing    → Go handlers, validation
💾 Kubernetes Storage     → etcd, CRs, Jobs, Pods
🚀 Operator               → Watch loops, reconciliation
🤖 Runner Pod             → Claude Code SDK, Git operations
🐙 GitHub                 → Remote repositories, branches, commits
✅ Response               → HTTP response, UI updates
```

---

## Common Questions

### Q: Why doesn't the RFEWorkflow CR track phase?

**A**: GitHub is the source of truth. Phase is **derived** from file existence:
- If `spec.md` doesn't exist → "specify" phase
- If `plan.md` doesn't exist → "plan" phase
- If `tasks.md` doesn't exist → "tasks" phase

This avoids state synchronization issues between K8s and Git.

### Q: Can I work on multiple tasks in parallel?

**A**: Yes! Create multiple AgenticSessions, all labeled with the same `rfe-workflow` but different prompts. They'll run in separate pods and commit to the same feature branch.

### Q: What happens if seeding fails midway?

**A**: The operation is **not atomic**. If spec-kit downloads but agent cloning fails, the spec-kit changes remain. The feature branch is created, but incomplete. You can re-run seeding, which will add missing files.

### Q: Can I manually edit files and commit?

**A**: Absolutely! The feature branch is a normal Git branch. You can clone it locally, make changes, and push. Agents will see your changes on the next session.

### Q: How do I know which session created which file?

**A**: Check Git commit history:
```bash
git log --oneline ambient-user-authentication
```
Each commit has the vTeam Bot author and a descriptive message.

---

## Troubleshooting Guide

### Seeding fails with "permission denied"

**Cause**: You don't have push access to the repo.

**Fix**:
1. Fork the repo
2. Update RFE workflow to use your fork
3. Re-run seeding

### Session stuck in "Pending"

**Cause**: Operator not running or no runner image available.

**Check**:
```bash
kubectl get pods -n vteam-system | grep operator
kubectl get pods -n my-project | grep session-
```

**Fix**: Ensure operator deployment is healthy.

### Auto-commit not working

**Cause**: `output.autoCommit` is `false` or Git token is invalid.

**Check**:
```bash
kubectl get secret project-secrets -n my-project -o yaml
```

**Fix**: Ensure `GIT_TOKEN` is set and has push permissions.

### Phase card shows wrong phase

**Cause**: GitHub API cache or file exists but wasn't detected.

**Fix**: Click "Refresh" button or wait 30 seconds for React Query cache to expire.

---

**End of Developer Flow Documentation**

This guide covers the complete journey from "Create Workspace" through "Review Phase", showing exactly what happens at each step, where data lives, and how components interact.

For more details on specific components:
- Backend API: See `components/backend/handlers/rfe.go`
- Seeding logic: See `components/backend/git/operations.go`
- Runner: See `components/runners/claude-code-runner/`
- Frontend: See `components/frontend/src/app/projects/[name]/rfe/`

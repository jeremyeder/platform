# RFE Workflow Documentation Generator

**Objective**: Regenerate the developer documentation for the RFE (Request For Enhancement) Workflow process in the Ambient Code Platform (ACP).

**Target File**: `docs/developer-guide/rfe-workflow-detailed-flow.md`

---

## Instructions

You are tasked with regenerating the complete RFE workflow documentation by exploring the current codebase. This documentation provides a phase-by-phase breakdown of what happens when developers work with RFE workflows, tracing the complete journey from browser through API, Kubernetes, GitHub, and back.

### Step 1: Explore the Codebase

Use the `code-explorer` agent to thoroughly understand the RFE workflow implementation. Focus on these key areas:

**Backend (Go)**:
- `components/backend/handlers/rfe.go` - All RFE API endpoints (create, seed, get, update, delete, sessions)
- `components/backend/git/operations.go` - Repository seeding logic, Git operations
- `components/backend/types/rfe.go` - Type definitions for RFEWorkflow
- `components/backend/routes.go` - Route registration

**Operator (Go)**:
- `components/operator/internal/handlers/sessions.go` - Watch loop and reconciliation
- `components/operator/internal/config/config.go` - K8s client initialization

**Runner (Python)**:
- `components/runners/claude-code-runner/claude_code_runner/__main__.py` - Runner execution logic

**Frontend (TypeScript/React)**:
- `components/frontend/src/app/projects/[name]/rfe/new/page.tsx` - Workflow creation form
- `components/frontend/src/app/projects/[name]/rfe/[id]/page.tsx` - Workflow detail page
- `components/frontend/src/services/api/rfe.ts` - API service functions
- `components/frontend/src/services/queries/use-rfe.ts` - React Query hooks

**CRD**:
- `components/manifests/crds/rfeworkflows-crd.yaml` - RFEWorkflow CRD schema

### Step 2: Trace the Data Flows

For each major phase, trace the complete flow:

1. **Create RFE Workspace**: UI form → API → Backend validation → K8s CR creation
2. **Check Seeding Status**: Frontend → Backend → GitHub API checks
3. **Seed Repository**: API → Backend Git operations → Spec-Kit download → Agent copying → Branch creation
4. **Specification Phases** (specify, plan, tasks): AgenticSession creation → Operator → Runner Pod → Claude Code SDK → GitHub commits
5. **Implementation Phase**: Same as spec phases but with different working directory
6. **Phase Progression**: How frontend determines current phase from GitHub file existence

### Step 3: Extract Key Information

For each handler/function, extract:
- Function names (for hyperlinks)
- Line numbers or line ranges
- Key operations performed
- API endpoints (HTTP method + path)
- Data storage locations (K8s etcd, GitHub, temp files, browser cache)

### Step 4: Generate the Documentation

Create `docs/developer-guide/rfe-workflow-detailed-flow.md` following this exact structure:

#### Document Structure

```markdown
# RFE Workflow: What Happens When You Hit Enter

**A Developer's Guide to the Ambient Code Platform (ACP) Guided RFE Workspace Process**

[Introduction paragraph]

## Table of Contents
[List all major sections]

## Architecture Overview
- Mermaid diagram showing component flow
- Key differences from standard sessions

## Phase 1: Create RFE Workspace
- User action flow (Mermaid sequence diagram)
- API request (http syntax highlighting)
- Backend processing (function name + GitHub link)
- Data storage table

## Phase 2: Check Seeding Status
- Check flow (Mermaid sequence diagram)
- API request
- Backend processing
- Data storage notes

## Phase 3: Seed Repository
- Seeding flow (Mermaid flowchart)
- API request
- Backend processing (detailed steps with GitHub links)
- Data storage table

## Phase 4-6: Specification Development
- Combined section for specify/plan/tasks phases
- Agent execution flow (Mermaid sequence diagram)
- API request example
- Backend/Operator/Runner processing
- Phase progression diagram (Mermaid)
- Data storage table

## Phase 7: Implementation
- Working directory changes diagram (Mermaid)
- API request example
- Runner execution details
- Data storage table

## Data Storage Locations
- Complete storage matrix table

## Key Architecture Insights
- Git as source of truth diagram (Mermaid)
- 5 key insights (numbered list)

## Common Questions
- 3-4 FAQ items with concise answers

## Troubleshooting Guide
- Common issues with cause/fix format
```

#### Format Requirements

**Mermaid Diagrams**:
- Use `sequenceDiagram` for API flows
- Use `graph TB` or `graph LR` for process flows
- Use `graph TD` for architecture diagrams
- Keep diagrams concise and readable
- Use styling for emphasis (e.g., `style GitHub fill:#f9f`)

**GitHub Hyperlinks**:
- Format: `[FunctionName](https://github.com/ambient-code/vTeam/blob/main/path/to/file.go#L123-L456)`
- Use line ranges when referencing code blocks
- Use single line numbers for specific operations
- Example: `[CreateProjectRFEWorkflow](https://github.com/ambient-code/vTeam/blob/main/components/backend/handlers/rfe.go#L142-L189)`

**HTTP Requests**:
```http
POST /api/projects/my-project/rfe-workflows
Authorization: Bearer {your-token}
Content-Type: application/json

{
  "key": "value"
}
```

**Code Snippets**:
- Minimize code snippets - prefer function names and flow descriptions
- Only include essential examples (API payloads, key bash commands)
- Use backticks for inline code: `spec.md`, `mainRepoIndex`

**Tables**:
- Data storage tables showing: Location | Data | Notes
- Use emojis for visual clarity: 💾 (K8s), 🐙 (GitHub), 💻 (Local)

**Dates**:
- Use current year (2025) for examples
- Unix timestamps should be realistic (e.g., Nov 2025 = ~1730635200)
- ISO timestamps: `2025-11-03T15:20:21Z`

**Terminology**:
- Use "Ambient Code Platform (ACP)" in prose
- Keep technical names: `vteam.ambient-code` (API group), `vteam-system` (namespace)
- Keep service names: "vTeam Bot" (git commit author)

**File Size**:
- Target ~600 lines total
- Be concise but comprehensive
- Focus on flow and function references, not implementation details

### Step 5: Quality Checks

Before finalizing:
- ✅ All GitHub links use correct repository URL and include line numbers
- ✅ All `.md` file references wrapped in backticks (except in code blocks)
- ✅ Mermaid diagrams render correctly
- ✅ HTTP requests use proper syntax highlighting
- ✅ Dates are current and realistic
- ✅ ACP terminology used consistently
- ✅ No excessive code snippets
- ✅ Tables formatted correctly
- ✅ Document is scannable and concise

---

## Output

Update the file `docs/developer-guide/rfe-workflow-detailed-flow.md` with the regenerated documentation.

Create a PR with:
- **Title**: `docs: regenerate RFE workflow documentation`
- **Description**:
  ```
  Automated regeneration of RFE workflow developer documentation.

  Updates based on current codebase structure and implementation.

  🤖 Generated via automated workflow
  ```

## Notes

- This documentation is critical for developer onboarding
- Accuracy is more important than speed
- When in doubt, explore the code to verify behavior
- Use the existing document as a style reference, but update all content based on current code

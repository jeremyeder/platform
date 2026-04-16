# Feature Specification: Project Memory Store (File-Based)

**Feature Branch**: `002-project-memory-store`
**Created**: 2026-04-15
**Revised**: 2026-04-16
**Status**: Draft

> **Architecture change**: This spec replaces the original CRD-based design. Memories are stored as
> markdown files in the workspace repository's `docs/learned/` directory and submitted as draft PRs
> with the `continuous-learning` label. This follows the pattern established in
> `jeremyeder/continuous-learning-example`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Runner Reads Learned Files at Session Init (Priority: P1)

When a new agentic session starts, the runner clones the workspace repository and reads all markdown files under `docs/learned/`. Each file has YAML frontmatter (type, date, session, project, author, title) and a markdown body. The runner injects the content into the agent's system prompt as a `## Project Memory` section, grouped by type (correction, pattern). The agent begins with accumulated project knowledge.

**Why this priority**: This is the primary consumer of learned knowledge. Without it, accumulated learnings have no effect on agent behavior.

**Independent Test**: Create a workspace repo with 3 files in `docs/learned/corrections/` and 2 in `docs/learned/patterns/`. Start a session. Inspect the system prompt passed to the agent SDK. Confirm all 5 entries appear grouped by type.

**Acceptance Scenarios**:

1. **Given** a workspace repo with 5 files in `docs/learned/` (3 corrections, 2 patterns), **When** a session starts, **Then** the runner injects all 5 entries into a `## Project Memory` section grouped under `### Corrections` and `### Patterns`.
2. **Given** a workspace repo with no `docs/learned/` directory, **When** a session starts, **Then** no `## Project Memory` section is added (no empty section, no error).
3. **Given** a learned file with frontmatter `type: correction` and title "Use Pydantic v2", **When** the runner formats the prompt section, **Then** the entry includes the title and full body text.
4. **Given** the runner cannot read `docs/learned/` (permission error, missing directory), **When** a session starts, **Then** the session proceeds without memories and logs a warning (non-fatal).
5. **Given** a workspace repo with `.ambient/config.json` containing `{"learning": {"enabled": false}}`, **When** a session starts, **Then** the runner skips memory injection entirely.

---

### User Story 2 - Opt-In via .ambient/config.json (Priority: P1)

A project maintainer enables continuous learning by adding `.ambient/config.json` with `{"learning": {"enabled": true}}` to the workspace repository. The runner checks this file at session init. If absent or `enabled: false`, the learning pipeline is inactive — no memory injection, no memory writing.

**Why this priority**: Opt-in prevents surprising behavior in repos that haven't adopted the CL pipeline. The config file is the control plane.

**Independent Test**: Create two workspace repos — one with `.ambient/config.json` enabling learning, one without. Start sessions in each. Verify memory injection only occurs in the enabled repo.

**Acceptance Scenarios**:

1. **Given** `.ambient/config.json` with `{"learning": {"enabled": true}}`, **When** a session starts, **Then** the runner reads `docs/learned/` and injects memories.
2. **Given** `.ambient/config.json` with `{"learning": {"enabled": false}}`, **When** a session starts, **Then** the runner skips all learning pipeline steps.
3. **Given** no `.ambient/config.json` exists, **When** a session starts, **Then** the runner treats learning as disabled (opt-in, not opt-out).
4. **Given** `.ambient/config.json` with malformed JSON, **When** a session starts, **Then** the runner logs a warning and treats learning as disabled.

---

### User Story 3 - Backend Lists Learned Files via Workspace API (Priority: P1)

A frontend component needs to display what the project has learned. The backend exposes a thin API that reads `docs/learned/` from the workspace repo via the existing workspace file API (or git clone). It returns a list of learned entries with their frontmatter metadata and content. No new CRUD handlers, no new CRDs — just a read-only view of files in the repo.

**Why this priority**: The UI needs a data source. Reusing the existing workspace file access pattern avoids new infrastructure.

**Independent Test**: With 5 files in `docs/learned/`, call `GET /api/projects/:projectName/learned`. Verify all 5 entries are returned with parsed frontmatter and content.

**Acceptance Scenarios**:

1. **Given** a workspace repo with learned files, **When** `GET /api/projects/:projectName/learned` is called, **Then** the response contains an array of entries with `title`, `type`, `date`, `author`, `content`, and `filePath`.
2. **Given** a workspace repo with no `docs/learned/` directory, **When** the endpoint is called, **Then** it returns an empty array with 200 (not 404).
3. **Given** a user without access to the project, **When** they call the endpoint, **Then** the request is rejected with 403 (enforced via user token, `GetK8sClientsForRequest`).
4. **Given** filtering by `?type=correction`, **When** the endpoint is called, **Then** only entries with `type: correction` frontmatter are returned.

---

### User Story 4 - Learned File Format and Directory Structure (Priority: P1)

Learned files follow the format established in `jeremyeder/continuous-learning-example`:

```
docs/learned/
  corrections/           # Corrections captured from sessions
    2026-04-01-use-pydantic-v2.md
  patterns/              # Patterns and conventions discovered
    2026-04-02-error-response-format.md
```

Each file has YAML frontmatter:

```yaml
---
type: correction | pattern
date: 2026-04-01T14:30:00Z
session: session-name
project: project-name
author: Agent | User Name
title: "Short descriptive title"
---

Body text describing the correction or pattern.
```

**Why this priority**: A stable file format is required before any component can read or write learned files.

**Acceptance Scenarios**:

1. **Given** a learned file with valid frontmatter, **When** the runner parses it, **Then** all frontmatter fields are extracted correctly.
2. **Given** a learned file with missing optional fields (session, project), **When** the runner parses it, **Then** the file is still loaded with available fields.
3. **Given** a file in `docs/learned/` without valid frontmatter, **When** the runner parses it, **Then** it is skipped with a warning log (not a fatal error).
4. **Given** a subdirectory name (`corrections/`, `patterns/`), **When** the runner groups entries, **Then** it uses the `type` frontmatter field (not the directory name) for grouping.

---

### Edge Cases

- **Empty `docs/learned/`**: Runner skips injection gracefully. Backend returns empty array.
- **Large number of learned files**: Runner caps injection at a token budget (e.g., ~4,000 tokens). Files sorted by date (newest first), oldest truncated with a count note.
- **Draft PRs with learned files**: Files on unmerged branches are NOT included. Runner reads from the default branch only.
- **Binary files in `docs/learned/`**: Skipped (only `.md` files are parsed).
- **Concurrent sessions writing**: Each session writes to a unique branch (`learned/<type>-<date>-<slug>`), so no git conflicts.
- **Learning disabled mid-session**: Config is read once at session init. Changes during the session have no effect.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Runner MUST check `.ambient/config.json` for `learning.enabled` at session init. If absent, malformed, or `false`, all learning pipeline steps are skipped.
- **FR-002**: Runner MUST read all `.md` files under `docs/learned/` from the workspace repo's default branch at session init, parsing YAML frontmatter and markdown body.
- **FR-003**: Runner MUST inject parsed learned entries into the agent's system prompt as a `## Project Memory` section, grouped by `type` field under `### Corrections` and `### Patterns` subheadings.
- **FR-004**: Runner MUST omit the `## Project Memory` section entirely when no learned files exist or learning is disabled.
- **FR-005**: Runner MUST enforce a token budget for injected memories (~4,000 tokens), sorting by date (newest first) and truncating with a count note.
- **FR-006**: Runner MUST treat all file read/parse failures as non-fatal, logging warnings and proceeding without memories.
- **FR-007**: Backend MUST expose `GET /api/projects/:projectName/learned` returning parsed learned file entries with frontmatter metadata and content.
- **FR-008**: Backend MUST support filtering the learned endpoint by `type` query parameter.
- **FR-009**: Backend MUST use `GetK8sClientsForRequest` for user-scoped RBAC on the learned endpoint.
- **FR-010**: Learned files MUST use the frontmatter schema: `type` (required, enum: `correction`, `pattern`), `date` (required, ISO 8601), `title` (required, string), `session` (optional), `project` (optional), `author` (optional).
- **FR-011**: Feature MUST be gated behind the `learning-agent-loop` feature flag.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A session started in a project with N learned files includes exactly N entries (up to token budget) in the `## Project Memory` prompt section.
- **SC-002**: A session started in a project with no learned files or learning disabled contains no `## Project Memory` section.
- **SC-003**: `GET /api/projects/:projectName/learned` returns correct entries matching files in the repo, verified by integration test.
- **SC-004**: Learned file parse failures do not prevent session startup, verified by test with malformed files.
- **SC-005**: Memory injection adds less than 500ms to session startup time for projects with up to 100 learned files.

## Assumptions

- The workspace repo is cloned by the runner at session init (existing behavior).
- The runner has read access to the repo's default branch via the workspace clone.
- The `.ambient/config.json` pattern is stable (established in `jeremyeder/continuous-learning-example`).
- The `type` enum (`correction`, `pattern`) may be extended in future specs but is sufficient for v1.
- The backend can read workspace repo files via the existing workspace file access pattern (git clone or GitHub API).

## Dependencies

- Workspace clone at session init: `components/runners/ambient-runner/` (existing)
- Backend workspace file access: `components/backend/handlers/` (existing pattern)
- Route registration: `components/backend/routes.go` under `projectGroup`
- Feature flag: `learning-agent-loop` in `components/manifests/base/core/flags.json`
- Reference implementation: `jeremyeder/continuous-learning-example`

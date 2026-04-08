# Implementation Plan: Continuous Learning

**Branch**: `001-continuous-learning` | **Date**: 2026-04-08 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `/specs/001-continuous-learning/spec.md`

## Summary

Continuous Learning captures knowledge from ACP sessions into `docs/learned/` via silent draft PRs, compiles the entire `docs/` tree into a wiki, and injects it into future sessions' system prompts. Implementation extends the existing runner prompt system, adds a workspace feature flag, and adds a "Learned" section to the triage dashboard. No new tools, hooks, or databases — system prompt instructions + `git` + `gh pr create --draft`.

## Technical Context

**Language/Version**: Python 3.11 (runner), Go 1.22+ (backend/operator), TypeScript/Next.js 16 (triage dashboard)
**Primary Dependencies**: Claude Agent SDK, `gh` CLI, `git`, llm-wiki-compiler plugin, Unleash (feature flags)
**Storage**: Git repositories (files in `docs/learned/`, `docs/wiki/`). No database.
**Testing**: pytest (runner), Go test (backend), Vitest (triage dashboard), Cypress (E2E)
**Target Platform**: Kubernetes (ACP runner pods), GitHub (draft PRs, Actions)
**Project Type**: Multi-component (runner + backend manifests + triage dashboard + example repo)
**Performance Goals**: Draft PR within 30s of correction, 10s for explicit save
**Constraints**: Silent capture (no user interruption), system prompt token budget (~200K)
**Scale/Scope**: Per-workspace, per-repo. One learning event = one draft PR.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. K8s-Native | PASS | Uses existing CRDs, ConfigMaps, Jobs. No new K8s resources. |
| II. Security & Multi-Tenancy | PASS | Uses existing PAT credential helper. Workspace-scoped flag isolation. |
| III. Type Safety & Error Handling | PASS | Runner: explicit error handling, silent failures logged. No panic in Go. |
| IV. TDD | PASS | Spec mandates TDD + gated evals per FR. |
| V. Component Modularity | PASS | Changes scoped to runner/prompts.py, runner/config.py, flags.json, triage dashboard. |
| VI. Observability | PASS | Silent capture with structured logging. Langfuse correction scores preserved. |
| VII. Resource Lifecycle | N/A | No new K8s child resources. |
| VIII. Context Engineering | PASS | Wiki compilation is context engineering — reduces token cost ~89%. |
| IX. Data Access & Knowledge | PASS | This IS a knowledge augmentation feature. |
| X. Commit Discipline | PASS | Will follow conventional commits, atomic changes per FR. |

**No violations. All gates pass.**

## Project Structure

### Documentation (this feature)

```text
specs/001-continuous-learning/
├── spec.md              # Feature specification (done)
├── plan.md              # This file
├── research.md          # Phase 0 output (done)
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
├── eval-log.md          # TDD eval audit trail
└── tasks.md             # Phase 2 output (speckit.tasks)
```

### Source Code (repository root)

```text
# Runner (Python) — primary changes
components/runners/ambient-runner/
├── ambient_runner/
│   ├── platform/
│   │   ├── prompts.py          # MODIFY: Add CL instructions, wiki injection
│   │   └── config.py           # MODIFY: Add load_repo_config()
│   └── bridges/claude/
│       └── bridge.py           # MODIFY: Read .ambient/config.json, evaluate CL flag
└── tests/
    ├── test_prompts.py         # ADD: CL prompt injection tests
    └── test_config.py          # ADD: .ambient/config.json parsing tests

# Backend manifests — flag definition
components/manifests/base/core/
└── flags.json                  # MODIFY: Add continuous-learning.enabled

# Triage dashboard — separate repo
~/repos/dashboards/triage/
├── src/
│   ├── lib/
│   │   ├── github.ts           # MODIFY: Add fetchLearnedPRs(), fetchPRFileContent()
│   │   └── pr-data.ts          # MODIFY: Add "learned" section type
│   └── components/
│       ├── dashboard.tsx        # MODIFY: Add learned section data flow
│       ├── pr-section.tsx       # MODIFY: Add learned section color
│       ├── summary-bar.tsx      # MODIFY: Add learned section nav
│       └── learned-content.tsx  # ADD: Inline markdown preview component
└── package.json

# Example repository — new GitHub repo
<jeremyeder/continuous-learning-example>/
├── .ambient/config.json
├── .wiki-compiler.json
├── ARCHITECTURE.md
├── docs/
│   ├── design-docs/
│   ├── references/
│   └── learned/
│       ├── corrections/
│       └── patterns/
├── src/                         # Small working API service
└── tests/

# GitHub Action workflow — in example repo
.github/workflows/
└── compile-wiki.yml             # Triggers wiki compilation on docs/ changes
```

**Structure Decision**: Multi-component — changes span runner (Python), backend manifests (JSON), triage dashboard (TypeScript/Next.js), and a new example repository. Each component is independently testable.

## Implementation Phases

### Phase A: P1 Foundation (FR-001 through FR-008)

**Stories 1-3: Correction Capture, Explicit Capture, Repo Config**

1. **FR-005/FR-006: Config & Flag Gates**
   - Add `continuous-learning.enabled` to flags.json
   - Add `load_repo_config()` to runner config.py — reads `.ambient/config.json`
   - Runner evaluates both gates: workspace flag (via backend API call) + repo config
   - Tests: config parsing, missing config, invalid config, multi-repo warning

2. **FR-001/FR-002: Correction Capture**
   - Extend `build_workspace_context_prompt()` with CL correction capture instructions
   - Instructions include: branch naming, file structure, frontmatter format, `gh pr create --draft`
   - Conditional on both gates being active
   - Tests: prompt injection with CL enabled/disabled, instruction content validation

3. **FR-003: Explicit Capture**
   - Add explicit capture instructions to the CL prompt section
   - "save this to learned" trigger → branch + file + draft PR
   - Tests: explicit capture instructions present, trigger phrase documented

4. **FR-004: Frontmatter Format**
   - Validate frontmatter template in instructions: type, date, session, project, author, title
   - Env vars: `AGENTIC_SESSION_NAME` (session), `PROJECT_NAME`, git config user.name (author)
   - Tests: frontmatter fields match spec

5. **FR-007: Branch/PR Conventions**
   - Branch: `learned/<type>-<YYYY-MM-DD>-<short-description>`
   - Always draft, labeled `continuous-learning`
   - Label auto-creation: `gh label create continuous-learning --force`
   - Tests: branch naming pattern, PR attributes in instructions

6. **FR-008: Silent Capture**
   - No AskUserQuestion, no confirmation prompts in correction path
   - Explicit capture: brief acknowledgment only ("Saved to learned knowledge.")
   - PR creation failures logged, not surfaced
   - Tests: instruction text validates silence requirement

### Phase B: P2 Wiki & Injection (FR-009 through FR-013)

**Stories 4-6: Review, Wiki Compilation, System Prompt Injection**

7. **FR-009: Storage Structure**
   - `docs/learned/corrections/` and `docs/learned/patterns/` directory convention
   - Documented in CL instructions
   - Tests: directory paths in instructions match spec

8. **FR-010/FR-011: Wiki Compilation**
   - `.wiki-compiler.json` config for compilation sources
   - GitHub Action workflow (`compile-wiki.yml`) using ambient-action (documented for production)
   - Example repo ships a complete standalone GHA with `workflow_dispatch` (manual trigger only)
   - Tests: config valid, workflow YAML valid, workflow_dispatch input defined

9. **FR-012/FR-013: System Prompt Injection**
   - Extend `resolve_workspace_prompt()` to check for `docs/wiki/INDEX.md` in cloned repos
   - If CL enabled + wiki exists: append wiki context instructions
   - If CL enabled but no wiki: graceful absence, no error
   - Tests: injection with wiki present, injection without wiki, CL disabled

### Phase C: P2 Dashboard & Example (FR-014 through FR-018)

**Stories 7-8: Triage Dashboard, Example Repository**

10. **FR-014/FR-015/FR-016: Triage Dashboard "Learned" Section**
    - Fetch: GitHub search API for draft PRs with `continuous-learning` label
    - Display: Inline file content from PR branch
    - Actions: merge (squash), close (discard), skip, bulk operations
    - Tests: Vitest unit tests for fetch, render, actions

11. **FR-017/FR-018: Example Repository**
    - Create `jeremyeder/continuous-learning-example` on GitHub
    - Real working codebase (simple Python API service with tests)
    - `.ambient/config.json`, `ARCHITECTURE.md`, `.wiki-compiler.json`
    - `docs/` with human-authored design docs + realistic `docs/learned/` files
    - Submit learned files as draft PRs
    - Tests: repo structure validation, draft PRs exist

## Key Design Decisions

### D1: Runner Flag Evaluation via Backend API

The runner calls the backend's feature flag evaluation API (`/api/projects/{project}/feature-flags/evaluate/continuous-learning.enabled`) during session setup. This avoids CRD changes and uses the same three-state evaluation logic (ConfigMap override > Unleash default) that the frontend uses.

### D2: Config File Separation

`.ambient/config.json` is distinct from `.ambient/ambient.json`. The former is repo-level ACP integration config (new convention, CL is first consumer). The latter is workflow-specific config. Both read during session setup, but from different paths.

### D3: CL Instructions Decoupled from Langfuse

Current correction instructions are gated by `is_langfuse_enabled()`. CL instructions are gated independently by the CL feature flag + repo config. Both can be active simultaneously — they complement each other (Langfuse logs corrections to observability; CL captures them as draft PRs).

### D4: Wiki Injection at Prompt Assembly Time

The wiki is read from disk at prompt assembly time (in `resolve_workspace_prompt()`), not at session startup. This means the wiki content is whatever was on the branch when the repo was cloned — no runtime compilation, no additional API calls.

### D5: Dashboard in Separate Repo

The triage dashboard is at `~/repos/dashboards/triage/` — a separate repo. Changes there are a separate PR from the platform changes. This is acceptable because the dashboard is independently deployable.

## Complexity Tracking

No constitution violations to justify.

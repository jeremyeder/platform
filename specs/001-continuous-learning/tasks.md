# Tasks: Continuous Learning

**Input**: Design documents from `/specs/001-continuous-learning/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/

**Tests**: Included — spec mandates TDD + gated evals per FR.

**Organization**: Tasks grouped by user story. US3 (Repo Config) is foundational — blocks US1/US2. US1/US2 can run in parallel after US3. P2 stories can run in parallel after P1 completion.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to

---

## Phase 1: Setup

**Purpose**: Feature flag definition and project scaffolding

- [ ] T001 Add `continuous-learning.enabled` flag to `components/manifests/base/core/flags.json` with `scope:workspace` tag
- [ ] T002 [P] Create eval log file at `specs/001-continuous-learning/eval-log.md` with header template

**Checkpoint**: Flag defined, eval log ready

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Config reading and flag evaluation infrastructure — MUST complete before any user story

**CRITICAL**: No user story work can begin until this phase is complete

### Tests for Foundation

- [ ] T003 [P] Write test for `load_repo_config()` in `components/runners/ambient-runner/tests/test_config.py` — valid config, missing file, invalid JSON, missing learning key, extra keys ignored
- [ ] T004 [P] Write test for `evaluate_workspace_flag()` in `components/runners/ambient-runner/tests/test_config.py` — successful eval, backend unreachable returns False, non-200 returns False
- [ ] T005 [P] Write test for `is_continuous_learning_enabled()` in `components/runners/ambient-runner/tests/test_config.py` — both gates on, flag off, config off, multi-repo warning

### Implementation for Foundation

- [ ] T006 Implement `load_repo_config(repo_path: str) -> dict` in `components/runners/ambient-runner/ambient_runner/platform/config.py` — reads `.ambient/config.json`, returns {} on missing/invalid, logs warnings
- [ ] T007 Implement `evaluate_workspace_flag()` in `components/runners/ambient-runner/ambient_runner/platform/config.py` — calls backend API `GET /api/projects/{project}/feature-flags/evaluate/{flag}`, returns bool
- [ ] T008 Implement `is_continuous_learning_enabled()` in `components/runners/ambient-runner/ambient_runner/platform/config.py` — evaluates both gates, returns (enabled, target_repo_path), warns on multi-repo
- [ ] T009 Run tests T003-T005 — all must pass

**EVAL GATE**: FR-005 (config reading) and FR-006 (two-gate activation) — verify both gates required

**Checkpoint**: Foundation ready — config reading and flag evaluation working

---

## Phase 3: User Story 3 — Repo Configuration (Priority: P1)

**Goal**: Runner reads `.ambient/config.json` from cloned repos during session setup and activates CL when both gates are met

**Independent Test**: Add `.ambient/config.json` to a repo, start a session with CL flag on, verify CL instructions appear in system prompt

### Tests for US3

- [ ] T010 [P] [US3] Write test for CL activation in bridge setup in `components/runners/ambient-runner/tests/test_bridge_cl.py` — mock repos with/without config, verify CL state passed to prompt builder
- [ ] T011 [P] [US3] Write test for multi-repo config handling in `components/runners/ambient-runner/tests/test_config.py` — two repos with CL enabled, verify warning logged and first repo used

### Implementation for US3

- [ ] T012 [US3] Integrate CL config reading into bridge session setup in `components/runners/ambient-runner/ambient_runner/bridges/claude/bridge.py` — after `resolve_workspace_paths()`, scan all repo paths for `.ambient/config.json`, evaluate CL flag, pass result to prompt builder
- [ ] T013 [US3] Update `resolve_workspace_prompt()` in `components/runners/ambient-runner/ambient_runner/platform/prompts.py` to accept `cl_config` parameter and conditionally call CL prompt builder
- [ ] T014 [US3] Run tests T010-T011 — all must pass

**EVAL GATE**: FR-005, FR-006 — verify config file is read, both gates are evaluated, missing config = no CL, flag off = no CL

**Checkpoint**: US3 complete — `.ambient/config.json` reading wired into session setup

---

## Phase 4: User Story 1 — Automatic Correction Capture (Priority: P1)

**Goal**: When Claude detects a correction, it silently creates a draft PR with a structured markdown file in `docs/learned/corrections/`

**Independent Test**: Start a session with CL enabled, issue a directive, correct Claude, verify draft PR created

### Tests for US1

- [ ] T015 [P] [US1] Write test for `build_continuous_learning_prompt()` in `components/runners/ambient-runner/tests/test_prompts.py` — verify correction capture instructions present, branch naming convention, frontmatter format, silent capture requirement
- [ ] T016 [P] [US1] Write test for CL prompt NOT injected when disabled in `components/runners/ambient-runner/tests/test_prompts.py` — flag off → no CL section, config off → no CL section

### Implementation for US1

- [ ] T017 [US1] Implement `build_continuous_learning_prompt()` in `components/runners/ambient-runner/ambient_runner/platform/prompts.py` — generates the full CL system prompt section including correction capture instructions from spec (branch naming, file structure, frontmatter with $SESSION_ID/$PROJECT_NAME/$USER_NAME, `gh pr create --draft`, silence requirement)
- [ ] T018 [US1] Add `CONTINUOUS_LEARNING_INSTRUCTIONS` constant in `components/runners/ambient-runner/ambient_runner/platform/prompts.py` — the correction capture section of the CL prompt (What Happened / The Correction / Why It Matters structure)
- [ ] T019 [US1] Wire `build_continuous_learning_prompt()` into `build_workspace_context_prompt()` in `components/runners/ambient-runner/ambient_runner/platform/prompts.py` — append CL section after corrections feedback section when CL is enabled
- [ ] T020 [US1] Run tests T015-T016 — all must pass

**EVAL GATE**: FR-001 (correction detection extended), FR-002 (silent draft PR creation in instructions), FR-004 (frontmatter format), FR-007 (branch/PR conventions), FR-008 (silent capture)

**Checkpoint**: US1 complete — correction capture instructions injected into system prompt

---

## Phase 5: User Story 2 — Explicit Capture (Priority: P1)

**Goal**: User says "save this to learned" and Claude silently creates a draft PR with captured knowledge

**Independent Test**: Start a session with CL enabled, say "save this to learned: <content>", verify draft PR created

### Tests for US2

- [ ] T021 [P] [US2] Write test for explicit capture instructions in `components/runners/ambient-runner/tests/test_prompts.py` — verify explicit capture section present in CL prompt, trigger phrase documented, brief acknowledgment requirement

### Implementation for US2

- [ ] T022 [US2] Add explicit capture section to `build_continuous_learning_prompt()` in `components/runners/ambient-runner/ambient_runner/platform/prompts.py` — "save this to learned" trigger, branch naming `learned/pattern-<date>-<desc>`, file placement in `docs/learned/patterns/`, brief acknowledgment "Saved to learned knowledge."
- [ ] T023 [US2] Add "What NOT to Capture" section to CL prompt in `components/runners/ambient-runner/ambient_runner/platform/prompts.py` — trivial info, existing docs, session-specific preferences
- [ ] T024 [US2] Run test T021 — must pass

**EVAL GATE**: FR-003 (explicit capture via natural language), FR-009 (storage structure with subdirectories)

**Checkpoint**: US2 complete — explicit capture instructions injected. All P1 stories done.

**P1 REGRESSION GATE**: Run all tests T003-T024 — all must pass before proceeding to P2

---

## Phase 6: User Story 6 — System Prompt Injection (Priority: P2)

**Goal**: Runner injects compiled wiki context into system prompt when CL enabled and wiki exists

**Independent Test**: Start a session with CL enabled and `docs/wiki/INDEX.md` present, verify system prompt contains wiki instructions

### Tests for US6

- [ ] T025 [P] [US6] Write test for `build_wiki_injection_prompt()` in `components/runners/ambient-runner/tests/test_prompts.py` — wiki exists → instructions present, wiki missing → empty string, CL disabled → no injection
- [ ] T026 [P] [US6] Write test for wiki injection integrated into `build_workspace_context_prompt()` in `components/runners/ambient-runner/tests/test_prompts.py` — end-to-end prompt assembly with wiki section

### Implementation for US6

- [ ] T027 [US6] Implement `build_wiki_injection_prompt(wiki_index_path: str) -> str` in `components/runners/ambient-runner/ambient_runner/platform/prompts.py` — instructions to read INDEX.md, use coverage indicators, fall back to raw sources for low-coverage
- [ ] T028 [US6] Wire wiki injection into `build_workspace_context_prompt()` in `components/runners/ambient-runner/ambient_runner/platform/prompts.py` — after CL section, check for `docs/wiki/INDEX.md` in target repo, append wiki instructions if found
- [ ] T029 [US6] Run tests T025-T026 — all must pass

**EVAL GATE**: FR-012 (wiki context injected), FR-013 (graceful absence)

**Checkpoint**: US6 complete — wiki injection closes the learning loop in the runner

---

## Phase 7: User Story 5 — Wiki Compilation (Priority: P2)

**Goal**: GitHub Actions compile the full docs/ tree into topic-based wiki articles

**Independent Test**: Push a docs change, trigger GHA, verify `docs/wiki/INDEX.md` updated

### Implementation for US5

- [ ] T030 [P] [US5] Create `.wiki-compiler.json` template in `specs/001-continuous-learning/contracts/wiki-compiler-config.json` — sources: docs/ (exclude wiki/), ARCHITECTURE.md; output: docs/wiki/
- [ ] T031 [P] [US5] Create ambient-action workflow at `specs/001-continuous-learning/contracts/compile-wiki-ambient.yml` — auto-trigger on push to docs/** or ARCHITECTURE.md on main
- [ ] T032 [P] [US5] Create standalone workflow at `specs/001-continuous-learning/contracts/compile-wiki.yml` — workflow_dispatch only with force input, complete standalone implementation

**EVAL GATE**: FR-010 (compilation from full docs/ tree), FR-011 (compiled output committed to docs/wiki/)

**Checkpoint**: US5 complete — wiki compilation workflows defined

---

## Phase 8: User Story 4 — Reviewing and Merging (Priority: P2)

**Goal**: Draft PRs contain enough context for reviewers to make keep/discard decisions

**Independent Test**: Create a draft PR via CL instructions, review PR format, verify context is sufficient

### Implementation for US4

- [ ] T033 [US4] Validate PR body template in CL instructions in `components/runners/ambient-runner/ambient_runner/platform/prompts.py` — ensure `gh pr create --draft --body` includes structured summary from learned file content, not just the title
- [ ] T034 [US4] Validate label creation in CL instructions — ensure `gh label create continuous-learning --force` runs before first PR creation

**EVAL GATE**: PR description provides enough context for review decision. Branch naming and labels enable filtering.

**Checkpoint**: US4 complete — PR format supports efficient review

---

## Phase 9: User Story 7 — Triage Dashboard (Priority: P2)

**Goal**: Triage dashboard shows "Learned Knowledge" section with inline content, merge/close/skip actions

**Independent Test**: Create learning draft PRs, load dashboard, verify Learned section with inline content and working actions

### Tests for US7

- [ ] T035 [P] [US7] Write test for `fetchLearnedPRs()` in `~/repos/dashboards/triage/src/lib/__tests__/github.test.ts` — mock GitHub API response, verify parsing of draft PRs with continuous-learning label
- [ ] T036 [P] [US7] Write test for `fetchPRFileContent()` in `~/repos/dashboards/triage/src/lib/__tests__/github.test.ts` — mock blob fetch, verify base64 decode of markdown content

### Implementation for US7

- [ ] T037 [US7] Implement `fetchLearnedPRs()` in `~/repos/dashboards/triage/src/lib/github.ts` — GitHub search API: `is:pr is:open is:draft label:continuous-learning`, return LearnedPR[] with number, title, author, created_at, branch
- [ ] T038 [US7] Implement `fetchPRFileContent()` in `~/repos/dashboards/triage/src/lib/github.ts` — GET /pulls/{n}/files → get filename+sha, GET /git/blobs/{sha} → base64 decode content
- [ ] T039 [US7] Add "learned" section type and color to `~/repos/dashboards/triage/src/lib/pr-data.ts` — id: "learned", defaultAction: "merge"
- [ ] T040 [US7] Add learned section color to `~/repos/dashboards/triage/src/components/pr-section.tsx` — violet: `border-l-violet-500`, `bg-violet-50 text-violet-800`
- [ ] T041 [US7] Add learned section color to `~/repos/dashboards/triage/src/components/summary-bar.tsx` — violet dot for learned section nav
- [ ] T042 [US7] Create `~/repos/dashboards/triage/src/components/learned-content.tsx` — inline markdown preview component with metadata header (title, author, date), renders raw markdown in a card
- [ ] T043 [US7] Integrate learned section into `~/repos/dashboards/triage/src/components/dashboard.tsx` — add `learnedPRs` state, call `fetchLearnedPRs()` in `refreshData()`, build learned section dynamically, wire merge/close/skip actions
- [ ] T044 [US7] Run tests T035-T036 — all must pass

**EVAL GATE**: FR-014 (learned section with dynamic fetch), FR-015 (inline content display), FR-016 (merge/close/skip + bulk ops)

**Checkpoint**: US7 complete — triage dashboard shows Learned section

---

## Phase 10: User Story 8 — Example Repository (Priority: P2)

**Goal**: Create a functional example repo demonstrating the full CL pipeline end-to-end

**Independent Test**: Clone repo, verify config files, verify draft PRs exist, run wiki compiler

### Implementation for US8

- [ ] T045 [US8] Create GitHub repo `jeremyeder/continuous-learning-example` via `gh repo create`
- [ ] T046 [US8] Create example API service — simple Python FastAPI app in `src/` with `main.py` (3-4 endpoints), `models.py`, `requirements.txt`
- [ ] T047 [P] [US8] Create `tests/test_main.py` with pytest tests for the example API service
- [ ] T048 [P] [US8] Create `.ambient/config.json` with `{"learning": {"enabled": true}}`
- [ ] T049 [P] [US8] Create `ARCHITECTURE.md` at repo root — bird's-eye codemap of the example service: modules, endpoints, data flow
- [ ] T050 [P] [US8] Create `.wiki-compiler.json` — sources: docs/ (exclude wiki/), ARCHITECTURE.md; output: docs/wiki/
- [ ] T051 [US8] Create `docs/design-docs/api-design.md` — human-authored design doc describing the example API's design decisions
- [ ] T052 [P] [US8] Create `docs/references/fastapi-patterns.md` — reference doc on FastAPI patterns used in the example
- [ ] T053 [US8] Create `docs/learned/corrections/2026-04-01-use-pydantic-v2.md` — realistic correction: agent used Pydantic v1 patterns, user corrected to v2. Proper frontmatter.
- [ ] T054 [P] [US8] Create `docs/learned/corrections/2026-04-03-async-endpoints.md` — realistic correction: agent wrote sync endpoints, user corrected to async. Proper frontmatter.
- [ ] T055 [P] [US8] Create `docs/learned/patterns/2026-04-02-error-response-format.md` — realistic pattern: standardized error response format. Proper frontmatter.
- [ ] T056 [P] [US8] Create `docs/learned/patterns/2026-04-05-health-check-convention.md` — realistic pattern: health check endpoint convention. Proper frontmatter.
- [ ] T057 [US8] Create `.github/workflows/compile-wiki.yml` — complete standalone GHA with workflow_dispatch only, force input
- [ ] T058 [P] [US8] Create `.github/workflows/compile-wiki-ambient.yml` — ambient-action workflow, auto-trigger on push to docs/** or ARCHITECTURE.md
- [ ] T059 [US8] Push all files to the example repo, then submit each learned/ file as a draft PR from a `learned/` branch with `continuous-learning` label
- [ ] T060 [US8] Verify: repo has all config files, `docs/` structure complete, 4+ draft PRs exist with correct labels

**EVAL GATE**: FR-017 (functional example repo), FR-018 (real codebase, not skeleton)

**Checkpoint**: US8 complete — example repo demonstrates full pipeline

---

## Phase 11: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, dev-cluster wiring, and demo readiness

- [ ] T061 Run full P1 + P2 eval suite — all FR evals pass
- [ ] T062 Run `python -m pytest tests/` in `components/runners/ambient-runner/` — all tests pass
- [ ] T063 [P] Verify `continuous-learning.enabled` flag synced to Unleash in dev cluster
- [ ] T064 [P] Enable flag for test workspace in dev cluster via workspace settings
- [ ] T065 Build and deploy runner image with CL changes to dev cluster via `make kind-rebuild CONTAINER_ENGINE=docker`
- [ ] T066 Write demo quickstart at `specs/001-continuous-learning/demo-quickstart.md` — step-by-step instructions to demo CL on the dev cluster

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately
- **Foundational (Phase 2)**: Depends on Setup — BLOCKS all user stories
- **US3 (Phase 3)**: Depends on Foundational — BLOCKS US1 and US2
- **US1 (Phase 4)** and **US2 (Phase 5)**: Both depend on US3 — CAN RUN IN PARALLEL
- **US6 (Phase 6)**: Depends on US1/US2 (needs CL prompt builder)
- **US5 (Phase 7)**: Independent after foundational — CAN RUN IN PARALLEL with US4/US6
- **US4 (Phase 8)**: Independent after US1 (needs PR format) — CAN RUN IN PARALLEL with US5/US6
- **US7 (Phase 9)**: Independent after foundational — CAN RUN IN PARALLEL with US4/US5/US6
- **US8 (Phase 10)**: Depends on all P1 stories + US5 (needs GHA templates)
- **Polish (Phase 11)**: Depends on all stories complete

### User Story Dependencies

```
Setup (Phase 1)
  └─→ Foundational (Phase 2)
        └─→ US3: Repo Config (Phase 3) ─── BLOCKS US1/US2
              ├─→ US1: Correction Capture (Phase 4) ──┐
              └─→ US2: Explicit Capture (Phase 5) ────┤── P1 COMPLETE
                                                       │
        ┌──────────────────────────────────────────────┘
        ├─→ US6: System Prompt Injection (Phase 6) ── needs CL prompt builder
        ├─→ US5: Wiki Compilation (Phase 7) ── parallel, independent
        ├─→ US4: Reviewing/Merging (Phase 8) ── parallel, needs PR format
        └─→ US7: Triage Dashboard (Phase 9) ── parallel, independent
              │
              └─→ US8: Example Repo (Phase 10) ── needs GHA templates
                    │
                    └─→ Polish (Phase 11)
```

### Parallel Opportunities

**After Foundational**: US3 must be sequential (blocks US1/US2)

**After US3**: US1 and US2 can run in parallel (different prompt sections, no shared state)

**After P1 complete**: US4, US5, US6, US7 can ALL run in parallel:
- US4 (PR format) — touches prompts.py PR body template
- US5 (wiki compilation) — creates GHA workflow files (no runner code)
- US6 (wiki injection) — touches prompts.py wiki section
- US7 (triage dashboard) — separate repo entirely

**After P2 stories**: US8 (example repo) then Polish

---

## Parallel Example: P2 Stories

```bash
# After P1 complete, launch 4 agents in parallel:
Agent 1: "US6 — Implement wiki injection in prompts.py (T025-T029)"
Agent 2: "US5 — Create GHA workflow files (T030-T032)"
Agent 3: "US4 — Validate PR body template in prompts.py (T033-T034)"
Agent 4: "US7 — Implement triage dashboard Learned section (T035-T044)"
```

---

## Implementation Strategy

### MVP First (P1 Stories: US3 → US1 → US2)

1. Complete Phase 1: Setup (T001-T002)
2. Complete Phase 2: Foundational (T003-T009)
3. Complete Phase 3: US3 — Repo Config (T010-T014)
4. Complete Phase 4+5: US1 + US2 in parallel (T015-T024)
5. **STOP and VALIDATE**: Run P1 regression gate
6. Deploy to dev cluster — CL capture is functional

### Incremental Delivery (P2 Stories)

7. Launch US4/US5/US6/US7 in parallel (T025-T044)
8. Complete US8: Example Repo (T045-T060)
9. Polish + dev-cluster wiring (T061-T066)
10. **Demo ready**

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Spec mandates TDD + gated evals — tests MUST fail before implementation
- Eval log goes to `specs/001-continuous-learning/eval-log.md`
- Dev cluster wiring happens in Phase 11 (T063-T066) — parallel with Polish
- Triage dashboard is a separate repo (`~/repos/dashboards/triage/`) — separate commit/PR

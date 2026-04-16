# Tasks: Advanced SDK Options

**Input**: Design documents from `/specs/010-advanced-sdk-options/`
**Prerequisites**: plan.md (required), spec.md (required)

## Phase 1: Setup

- [ ] T001 [P1] Add `advanced-sdk-options` feature flag to `components/manifests/base/core/flags.json` with `scope:workspace` tag and description "Expose Claude Agent SDK options in session creation UI"
- [ ] T002 [P1] Verify flag syncs: run `make lint` to confirm `flags.json` is valid JSON and passes check-yaml

## Phase 2: Backend

### Types

- [ ] T010 [P1] [US1] Add `SdkOptions map[string]interface{}` field with `json:"sdkOptions,omitempty"` to `CreateAgenticSessionRequest` in `components/backend/types/session.go`

### Allowlist + Validation (TDD)

- [ ] T011 [P1] [US1] Create test file `components/backend/handlers/sessions_sdk_options_test.go` with `//go:build test` tag. Write tests for `filterSdkOptions`: valid keys pass, unknown keys dropped silently, empty map returns nil
- [ ] T012 [P1] [US1] Write tests for `validateSdkOptionValue`: `temperature` accepts float64, rejects string; `max_turns` accepts int, rejects float; `system_prompt` accepts string, rejects number; `allowed_tools` accepts []interface{}, rejects string
- [ ] T013 [P1] [US1] Run tests, verify they fail (functions not yet implemented): `cd components/backend && go test -tags test -run TestSdkOptions ./handlers/`
- [ ] T014 [P1] [US1] Implement `allowedSdkOptionKeys` map and `filterSdkOptions(opts map[string]interface{}) (map[string]interface{}, error)` in `components/backend/handlers/sessions.go`. Allowlist keys: `temperature`, `max_turns`, `max_budget_usd`, `effort`, `system_prompt`, `permission_mode`, `allowed_tools`, `disallowed_tools`, `thinking`, `max_buffer_size`, `include_partial_messages`, `enable_file_checkpointing`, `sandbox`, `output_format`, `betas`, `hooks`, `agents`, `plugins`, `tools`, `env`, `extra_args`, `user`
- [ ] T015 [P1] [US1] Implement `validateSdkOptionValue(key string, value interface{}) error` in `components/backend/handlers/sessions.go`. Type-check each key: floats for `temperature`/`max_budget_usd`, int for `max_turns`/`max_buffer_size`, string for `system_prompt`/`permission_mode`/`effort`/`user`, bool for `include_partial_messages`/`enable_file_checkpointing`, slice for `allowed_tools`/`disallowed_tools`/`betas`/`plugins`, map for `thinking`/`sandbox`/`output_format`/`hooks`/`agents`/`env`/`extra_args`/`tools`
- [ ] T016 [P1] [US1] Run tests, verify they pass: `cd components/backend && go test -tags test -run TestSdkOptions ./handlers/`

### Handler Integration

- [ ] T017 [P1] [US1] In `CreateAgenticSession` handler in `components/backend/handlers/sessions.go`, after `envVars` is populated: if `req.SdkOptions` is non-empty, call `filterSdkOptions`, return 400 on validation error, JSON-serialize the result into `envVars["SDK_OPTIONS"]`. Skip if filtered result is empty
- [ ] T018 [P1] [US1] Write integration test in `components/backend/handlers/sessions_sdk_options_test.go`: POST create session with `sdkOptions: {"temperature": 0.3, "max_turns": 5}`, verify CR has `environmentVariables.SDK_OPTIONS` containing the JSON
- [ ] T019 [P1] [US1] Write edge-case test: POST with `sdkOptions: {"temperature": "hot"}` returns HTTP 400
- [ ] T020 [P1] [US1] Write edge-case test: POST with `sdkOptions: {"unknown_key": 42}` succeeds, CR `SDK_OPTIONS` does not contain `unknown_key`
- [ ] T021 [P1] [US1] Write edge-case test: POST with `sdkOptions: {}` succeeds, CR has no `SDK_OPTIONS` key in env vars
- [ ] T022 [P1] [US1] Run full backend tests: `cd components/backend && go test -tags test ./handlers/`
- [ ] T023 [P1] [US1] Run backend linters: `cd components/backend && gofmt -l . && go vet ./...`

### Commit

- [ ] T024 [P1] Commit Phase 2: "feat(backend): add sdkOptions allowlist and type validation for session creation"

## Phase 3: User Story 1 -- Configure SDK Options (P1)

### Runner: SDK_OPTIONS Parsing (TDD)

- [ ] T030 [P1] [US1] Create test file `components/runners/ambient-runner/tests/test_sdk_options.py`. Write tests: parse valid JSON from `SDK_OPTIONS` env var, merge into adapter options dict; malformed JSON logs warning and returns empty dict; JSON array (not object) logs warning and returns empty dict
- [ ] T031 [P1] [US1] Write denylist tests in `components/runners/ambient-runner/tests/test_sdk_options.py`: `cwd`, `api_key`, `mcp_servers`, `setting_sources`, `stderr`, `resume`, `continue_conversation`, `add_dirs` are blocked; each blocked key logs a warning; non-blocked keys pass through
- [ ] T032 [P1] [US1] Write system_prompt merge test: when `SDK_OPTIONS` contains `system_prompt`, the platform system prompt dict is preserved and user text is appended under `## Custom Instructions` heading
- [ ] T033 [P1] [US1] Run tests, verify they fail: `cd components/runners/ambient-runner && python -m pytest tests/test_sdk_options.py -v`
- [ ] T034 [P1] [US1] Implement `_SDK_OPTIONS_DENYLIST` frozenset and `parse_sdk_options(env_var: str) -> dict` function in `components/runners/ambient-runner/ambient_runner/bridges/claude/bridge.py`. Parse JSON, apply denylist, log warnings for blocked keys
- [ ] T035 [P1] [US1] Implement `_merge_system_prompt(platform_prompt: dict, user_prompt: str) -> dict` in `components/runners/ambient-runner/ambient_runner/bridges/claude/bridge.py`. Append user text under `## Custom Instructions` in the platform prompt's append field
- [ ] T036 [P1] [US1] Integrate in `_ensure_adapter`: call `parse_sdk_options(os.getenv("SDK_OPTIONS", ""))`, handle `system_prompt` key via `_merge_system_prompt`, merge remaining keys into the `options` dict before constructing `ClaudeAgentAdapter` in `components/runners/ambient-runner/ambient_runner/bridges/claude/bridge.py`
- [ ] T037 [P1] [US1] Run tests, verify they pass: `cd components/runners/ambient-runner && python -m pytest tests/test_sdk_options.py -v`
- [ ] T038 [P1] [US1] Run runner linters: `cd components/runners/ambient-runner && ruff check . && ruff format --check .`

### Commit

- [ ] T039 [P1] Commit Phase 3 runner: "feat(runner): parse SDK_OPTIONS env var with denylist and system prompt merge"

### Frontend: Types

- [ ] T040 [P1] [US1] Rename `agentOptions` field to `sdkOptions` with type `Record<string, unknown>` in `CreateAgenticSessionRequest` in `components/frontend/src/types/api/sessions.ts`. Update the TODO comment to reference `SDK_OPTIONS` env var
- [ ] T041 [P1] [US1] Rename `agentOptions` field to `sdkOptions` in `CreateAgenticSessionRequest` in `components/frontend/src/types/agentic-session.ts` (canonical type location)

### Frontend: Wire AdvancedSdkOptions into NewSessionView (TDD)

- [ ] T042 [P1] [US1] Create test file `components/frontend/src/components/__tests__/advanced-sdk-options.test.tsx`. Write tests: component renders collapsed by default; expanding reveals form fields; form values are emitted on change; component is not rendered when `advanced-sdk-options` flag is false
- [ ] T043 [P1] [US1] Run tests, verify they fail: `cd components/frontend && npx vitest run --reporter=verbose src/components/__tests__/advanced-sdk-options.test.tsx`
- [ ] T044 [P1] [US1] Create `components/frontend/src/components/advanced-sdk-options.tsx` — a collapsible wrapper that imports `AgentOptionsFields` from `components/claude-agent-options` and renders inside a `Collapsible` from shadcn/ui. Props: `projectName: string`, `form: UseFormReturn<ClaudeAgentOptionsForm>`, `disabled?: boolean`. Uses `useWorkspaceFlag(projectName, "advanced-sdk-options")` to gate visibility
- [ ] T045 [P1] [US1] In `components/frontend/src/app/projects/[name]/sessions/[sessionName]/components/new-session-view.tsx`: import `AdvancedSdkOptions`, add `useForm<ClaudeAgentOptionsForm>` with `claudeAgentOptionsDefaults`, render `<AdvancedSdkOptions>` between the input area and pending repo badges. Add `sdkOptions` to the `onCreateSession` callback config type
- [ ] T046 [P1] [US1] In `NewSessionViewProps.onCreateSession` callback type, add `sdkOptions?: Record<string, unknown>`. In `handleSubmit`, collect non-empty form values and pass as `sdkOptions`
- [ ] T047 [P1] [US1] In `components/frontend/src/app/projects/[name]/new/page.tsx`: update `handleCreateNewSession` config type to include `sdkOptions`. Wire `config.sdkOptions` into the `createSessionMutation.mutate` data payload as `sdkOptions`
- [ ] T048 [P1] [US1] Run tests, verify they pass: `cd components/frontend && npx vitest run --reporter=verbose src/components/__tests__/advanced-sdk-options.test.tsx`
- [ ] T049 [P1] [US1] Run full frontend test suite: `cd components/frontend && npx vitest run`
- [ ] T050 [P1] [US1] Run frontend build: `cd components/frontend && npm run build`

### Frontend: Update create-session-dialog.tsx (dead code cleanup)

- [ ] T051 [P1] [US1] In `components/frontend/src/components/create-session-dialog.tsx`, update references from `advanced-agent-options` flag to `advanced-sdk-options` and from `agentOptions` to `sdkOptions` in the mutation payload (if this dialog is still used anywhere; otherwise note it as dead code)

### Commit

- [ ] T052 [P1] Commit Phase 3 frontend: "feat(frontend): add AdvancedSdkOptions collapsible form gated by workspace flag"

## Phase 4: User Story 2 -- SDK Options Drift Detection (P2)

- [ ] T060 [P2] [US2] Create `components/runners/ambient-runner/sdk-options-manifest.json` with current `ClaudeAgentOptions` fields and types from `claude-agent-sdk`. Format: `{"version": "0.1.48", "fields": {"temperature": "float", "max_turns": "int", ...}}`
- [ ] T061 [P2] [US2] Create `.github/workflows/claude-sdk-options-drift.yml`: weekly cron (`0 6 * * 1`) + `workflow_dispatch`. Job: checkout, setup Python 3.12, `uv pip install claude-agent-sdk`, run introspection script, compare against manifest, open PR with `amber:auto-fix` label if drift detected, clean exit if no drift, hard fail on errors
- [ ] T062 [P2] [US2] Create `scripts/sdk-options-drift-check.py`: import `ClaudeAgentOptions` from `claude_agent_sdk`, introspect fields via `typing.get_type_hints()` or `dataclasses.fields()`, compare against `sdk-options-manifest.json`, write updated manifest if drift found, exit 0 on no drift, exit 1 on drift (for GHA to detect), exit 2 on error
- [ ] T063 [P2] [US2] Write test in `components/runners/ambient-runner/tests/test_sdk_options.py`: mock `ClaudeAgentOptions` with an extra field, verify drift script detects it
- [ ] T064 [P2] [US2] Run drift check manually to verify clean baseline: `cd components/runners/ambient-runner && python ../../scripts/sdk-options-drift-check.py`

### Commit

- [ ] T065 [P2] Commit Phase 4: "feat(ci): add weekly Claude SDK options drift detection workflow"

## Phase 5: Polish

- [ ] T070 [P1] Run full backend test suite: `cd components/backend && make test`
- [ ] T071 [P1] Run full frontend test suite with coverage: `cd components/frontend && npx vitest run --coverage`
- [ ] T072 [P1] Run full runner test suite: `cd components/runners/ambient-runner && python -m pytest tests/ -v`
- [ ] T073 [P1] Run pre-commit hooks on all changed files: `make lint`
- [ ] T074 [P1] Run frontend production build: `cd components/frontend && npm run build`
- [ ] T075 [P1] Verify no `any` types in new/modified frontend code (grep changed .tsx/.ts files for `: any` or `as any`)
- [ ] T076 [P1] Verify all acceptance scenarios from spec.md are covered by tests (cross-reference SC-001 through SC-005)
- [ ] T077 [P1] Final commit if any polish changes: "chore: polish and lint fixes for advanced SDK options"

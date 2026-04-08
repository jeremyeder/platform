# Research: Continuous Learning

## R1: Runner Prompt System

**Decision**: Extend `build_workspace_context_prompt()` with a new conditional section for Continuous Learning, following the existing Langfuse/correction pattern.

**Rationale**: The prompt builder already uses conditional sections gated by env vars and feature checks. CL instructions follow the same pattern — injected when both gates are active.

**Key Findings**:
- `CORRECTION_DETECTION_INSTRUCTIONS` (prompts.py:110-116) is 6 lines — tells Claude to call `log_correction` before acting on corrections
- `resolve_workspace_prompt()` (prompts.py:268-292) delegates to `build_workspace_context_prompt()` which assembles sections sequentially
- Sections are conditionally appended: Langfuse check gates correction instructions, `GITHUB_TOKEN` gates git push instructions, `ambient.json` gates workflow instructions
- CL instructions are ~40 lines (from spec) — similar size to existing conditional sections
- `load_ambient_config()` reads `.ambient/ambient.json` from CWD — we need a new function for `.ambient/config.json`

**Alternatives Considered**:
- Separate prompt file imported at runtime — rejected (breaks single-file pattern, harder to test)
- MCP tool for CL instead of system prompt instructions — rejected (spec explicitly chose prompt instructions, no new tools)

## R2: Runner Bridge Session Setup

**Decision**: Read `.ambient/config.json` during `_setup_platform()` and pass the learning config into prompt assembly.

**Rationale**: The bridge already reads `.ambient/ambient.json` for workflow config. Reading `.ambient/config.json` for repo-level CL config follows the same pattern.

**Key Findings**:
- `_setup_platform()` (bridge.py:522-584) runs on first `run()` call, sets up auth, credentials, workspace, MCP, observability, and system prompt
- `load_ambient_config()` (config.py:19-42) reads `.ambient/ambient.json` — handles missing file gracefully
- System prompt is `{"type": "preset", "preset": "claude_code", "append": <workspace_prompt>}` (claude/prompts.py:11-20)
- Repos cloned to `/workspace/repos/{name}/` with `.git` intact
- Session env vars available: `AGENTIC_SESSION_NAME`, `PROJECT_NAME` (from context), `WORKSPACE_PATH`
- `USER_NAME` — need to verify availability; may need to derive from git config or session metadata
- Repos auto-discovered from `REPOS_JSON` env var (JSON array of repo configs)

**Integration Point**: After `resolve_workspace_paths()` resolves CWD and repos, scan all repo paths for `.ambient/config.json`. If found with `learning.enabled: true`, pass to prompt builder.

## R3: Feature Flag System

**Decision**: Add `continuous-learning.enabled` to `flags.json` with `scope:workspace` tag. Runner evaluates via env var set by backend on session creation.

**Rationale**: Follows the existing pattern — flags.json defines the flag, SyncFlags creates it in Unleash, workspace admins toggle via ConfigMap override, runner reads env var.

**Key Findings**:
- flags.json format: `{"flags": [{"name": "...", "description": "...", "tags": [{"type": "scope", "value": "workspace"}]}]}`
- 4 existing flags, all workspace-scoped
- `SyncFlags` (sync_flags.go:251) reads flags.json, creates in Unleash with `flexibleRollout` strategy
- `useWorkspaceFlag()` hook evaluates: ConfigMap override > Unleash default, returns `{enabled, source, isLoading}`
- `EvaluateFeatureFlag` handler checks ConfigMap `feature-flag-overrides` first, then Unleash SDK
- Runner doesn't directly call Unleash — it reads env vars (e.g., `LANGFUSE_ENABLED`)

**Runner Flag Evaluation**: The runner needs to know if CL is enabled for the workspace. Options:
1. Backend sets `CONTINUOUS_LEARNING_ENABLED` env var on the AgenticSession CR → operator copies to Job pod → runner reads
2. Runner calls backend's `/api/projects/{project}/feature-flags/evaluate/continuous-learning.enabled` at startup
3. Operator evaluates flag and sets env var on Job

**Selected**: Option 2 — runner calls backend API. The runner already calls backend APIs for credential fetching. This avoids CRD changes and keeps flag evaluation consistent (same three-state logic: ConfigMap override > Unleash).

## R4: Triage Dashboard

**Decision**: Add "Learned" section to existing triage dashboard using the same PRSectionCard pattern, with dynamic PR fetching filtered by `continuous-learning` label.

**Rationale**: The dashboard already has the component architecture (PRSectionCard, PRRow, action dispatch) and GitHub API integration. Adding a section is extending existing patterns, not building new infrastructure.

**Key Findings**:
- Framework: Next.js 16.2.1, React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- Location: `~/repos/dashboards/triage/`
- PRSectionCard (pr-section.tsx:60-178) — collapsible card with color-coded border, table rows, bulk actions
- PRRow (pr-section.tsx:180-288) — individual PR with action dropdown (close/merge/approve/skip/etc.)
- GitHub API via direct `fetch()` to `api.github.com` with PAT auth
- Actions: close, merge, approve, kick_ci, rebase, comment, address_feedback, skip
- Dashboard dynamically builds sections (e.g., rebase section from `mergeable_state`)
- Color system: semantic border-left colors per section (red=close, green=merge, cyan=rebase)

**New Components Needed**:
- Fetch function: `fetchLearnedPRs(org, repo, token)` — uses GitHub search API: `is:pr is:draft label:continuous-learning`
- Inline content: `fetchPRFileContent(org, repo, pr, token)` — reads the `docs/learned/` file from the PR's branch
- Section color: Purple/violet (`border-l-violet-500`) — distinct from existing colors
- Actions: merge (squash), close (discard), skip

## R5: llm-wiki-compiler

**Decision**: Use llm-wiki-compiler as-is via `.wiki-compiler.json` config. Compilation triggered by GitHub Action via ambient-action (primary) or standalone GHA (alternative).

**Rationale**: The compiler is production-ready, installed locally, and designed for exactly this use case. No custom compilation needed.

**Key Findings**:
- Installed at `~/.claude/plugins/repos/llm-wiki-compiler/`
- Skill available: `llm-wiki-compiler:wiki-compiler`
- Config format: `.wiki-compiler.json` with `sources[]`, `output`, `mode`, `article_sections[]`
- Output: `docs/wiki/INDEX.md` + `topics/*.md` + `concepts/*.md` with coverage indicators
- 5-phase compilation: scan → classify → compile topics → discover concepts → update index
- Token reduction: ~89% (79K → 8.5K per session) based on real-world benchmarks
- Coverage tags: `[coverage: high/medium/low -- N sources]` per article section
- No `.wiki-compiler.json` exists in platform repo yet — will be created by this feature

**Config for ACP**:
```json
{
  "version": 1,
  "name": "Ambient Code Platform",
  "sources": [
    {"path": "docs/", "exclude": ["wiki/"]},
    {"path": "ARCHITECTURE.md"}
  ],
  "output": "docs/wiki/",
  "mode": "recommended"
}
```

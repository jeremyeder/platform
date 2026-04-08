# Feature Specification: Continuous Learning

**Feature Branch**: `001-continuous-learning`
**Created**: 2026-04-07
**Status**: Draft
**Input**: Shared memory for ACP workspaces — Claude Code's memory pattern, promoted from local/personal to repo-level/shared, with GitHub PRs as the human-in-the-loop curation gate and the full `docs/` tree compiled into a wiki that serves as the agent's runtime knowledge base.

## Problem

Claude Code already has a memory system: markdown files with frontmatter, an index, auto-save during conversations, auto-read at session start. But it's local to one developer's machine. When a developer learns something important — a correction, a pattern, a convention — that knowledge lives in `~/.claude/projects/` and dies with their laptop.

In a team environment on ACP, this means every session starts from scratch. The same mistakes get made across sessions and across developers. Knowledge doesn't compound — it fragments.

This is a memory problem, not a model problem. The model is smart enough. The harness doesn't learn.

## Solution

Continuous Learning captures knowledge into `docs/learned/` in the repository, alongside human-authored documentation. The entire `docs/` tree — design docs, product specs, architecture, references, AND learned knowledge — is compiled into a single wiki by the llm-wiki-compiler. The compiled wiki IS the agent's runtime harness.

### The docs/ Structure

Following the harness engineering pattern and the ARCHITECTURE.md convention (matklad), a repository's `docs/` directory becomes the single source of truth for agent context:

```
ARCHITECTURE.md            # Bird's-eye codemap: modules, invariants, cross-cutting concerns
                           # (matklad pattern: name important files/modules, highlight
                           #  architectural invariants, identify layer boundaries.
                           #  Maintain loosely — revisit a few times yearly, not on every commit.)
docs/
├── design-docs/           # Human-authored design principles, core beliefs, ADRs
├── product-specs/         # Human-authored feature specifications
├── references/            # Human-authored reference materials (llms.txt, etc.)
├── learned/               # Machine-captured, PR-triaged
│   ├── corrections/       # Corrections from sessions
│   └── patterns/          # Explicitly saved patterns, conventions, gotchas
└── wiki/                  # Auto-compiled from ALL of docs/ + ARCHITECTURE.md
    ├── INDEX.md            # (never edit manually)
    ├── topics/
    └── concepts/
```

- **ARCHITECTURE.md** sits at the repo root (per convention). It provides the bird's-eye codemap: coarse-grained modules, their relationships, architectural invariants, and cross-cutting concerns. It's maintained loosely by humans, not synced on every commit.
- **Human-authored docs** (design-docs/, product-specs/, references/) are maintained by the team directly.
- **Learned knowledge** (learned/) is captured from sessions via draft PRs, curated by the team.
- **The compiled wiki** (wiki/) synthesizes everything — ARCHITECTURE.md, human-authored docs, and learned knowledge — into topic-based articles with coverage indicators. The agent reads the wiki, not the raw files.

### How Continuous Learning Fits

- **Same pattern as Claude Code memory**: Claude detects corrections and explicit saves via system prompt instructions and conversational understanding. Instead of writing to `~/.claude/projects/.../memory/`, it creates a branch, writes a `docs/learned/` file, and runs `gh pr create --draft`.
- **Shared**: Every session reads the compiled wiki. Every developer's corrections feed `docs/learned/`. Multiple agents' partial views merge into one knowledge base.
- **Curated**: GitHub draft PRs are the curation gate. The team collectively decides what becomes knowledge vs. noise. The merge button is the "learning" event.
- **Consolidated**: The llm-wiki-compiler compiles the ENTIRE `docs/` tree plus `ARCHITECTURE.md` — not just `docs/learned/` — into topic-based articles. Human-authored design docs and machine-learned corrections get synthesized together into one coherent knowledge surface.
- **Injected**: ACP's session orchestration injects the compiled wiki into the system prompt at session start, closing the loop so future sessions benefit from all repository knowledge.

The key insight: storing interactions is not learning. The PR triage step — where the team decides what to keep, what to merge, what to discard — is the actual learning. Everything else is plumbing.

## Architecture

### Existing Infrastructure (already built)

The ACP runner already has correction detection infrastructure that Continuous Learning extends:

- **`CORRECTION_DETECTION_INSTRUCTIONS`** in `prompts.py` — system prompt instructions telling Claude to detect corrections and log them. Already injected when Langfuse is enabled.
- **`log_correction` MCP tool** in `corrections.py` — structured correction logging with types (incomplete, incorrect, out_of_scope, style), agent_action, user_correction, target repo.
- **`gh` CLI** — installed in runner pods, authenticated via PAT credential helper. Can create branches and draft PRs.
- **Target auto-discovery** — repos and workflows auto-discovered from environment variables.

### What Continuous Learning Adds

Two new behaviors, both driven by **system prompt instructions** (no new hooks or tools). Both are **silent** — neither interrupts the developer's session:

1. **Correction capture**: When Claude detects a correction (existing `CORRECTION_DETECTION_INSTRUCTIONS` logic), it silently creates a branch, writes a `docs/learned/corrections/` file with structured frontmatter, and runs `gh pr create --draft`. No confirmation prompt. The draft PR shows up for triage later.

2. **Explicit capture**: When the user says "save this to learned" (or equivalent trigger), Claude silently creates a branch, writes a `docs/learned/` file, and runs `gh pr create --draft`.

Both paths produce the same artifact: a draft PR with a markdown file, labeled `continuous-learning`. The triage dashboard is where humans decide what to keep. The session is never interrupted.

Each session creates a uniquely-named branch per learning event, so concurrent sessions pushing to the same repo do not conflict.

### System Prompt Instructions

The following instructions are injected into the system prompt when both gates are active (workspace flag on + `.ambient/config.json` present with learning enabled):

```
## Continuous Learning

This repository has continuous learning enabled. Two behaviors are active:

### Correction Capture
When you detect a correction — the user redirects, rejects, or overrides your
approach — silently capture it:
1. `cd <target-repo-path>` (MUST be inside the repo directory for git/gh commands)
2. Create a branch: `git checkout -b learned/correction-<YYYY-MM-DD>-<short-description>`
3. Ensure the label exists: `gh label create continuous-learning --force`
4. Write a markdown file to docs/learned/corrections/<filename>.md with frontmatter:
   ---
   type: correction
   date: <ISO8601>
   session: $AGENTIC_SESSION_NAME
   project: $PROJECT_NAME
   author: <from git config user.name>
   title: "<short human-readable title>"
   ---
   ## What Happened
   <what you did>
   ## The Correction
   <what the user said to do instead>
   ## Why It Matters
   <reasoning, context, implications>
5. Commit, push, and create draft PR: `gh pr create --draft --title "learned: <title>" --label continuous-learning`
6. Switch back to working branch: `git checkout <original-branch>`
7. Do NOT ask the user for confirmation. Do NOT mention the PR creation.
   If any step fails, log the error and continue silently.

### Explicit Capture
When the user says "save this to learned: <content>" (or similar phrasing):
1. `cd <target-repo-path>` (MUST be inside the repo directory for git/gh commands)
2. Create a branch: `git checkout -b learned/pattern-<YYYY-MM-DD>-<short-description>`
3. Ensure the label exists: `gh label create continuous-learning --force`
4. Write a markdown file to docs/learned/patterns/<filename>.md with frontmatter:
   ---
   type: pattern
   date: <ISO8601>
   session: $AGENTIC_SESSION_NAME
   project: $PROJECT_NAME
   author: <from git config user.name>
   title: "<short human-readable title>"
   ---
   <content provided by the user, expanded with context>
5. Commit, push, and create draft PR: `gh pr create --draft --title "learned: <title>" --label continuous-learning`
6. Switch back to working branch: `git checkout <original-branch>`
7. Acknowledge the save briefly ("Saved to learned knowledge.") and continue.

### What NOT to Capture
- Trivial or temporary information (one-off commands, debugging steps)
- Information already in ARCHITECTURE.md or docs/
- Preferences that are session-specific, not repo-wide
```

### Configuration

**Two gates required for activation:**

1. **Workspace level**: `continuous-learning.enabled` feature flag must be on (disabled by default)
2. **Repo level**: `.ambient/config.json` in the cloned repo must include learning configuration

```json
// .ambient/config.json (in the user's repo)
{
  "learning": {
    "enabled": true
  }
}
```

**Processing of `.ambient/config.json`**: When the runner clones a repo during session setup, it scans all repos at `/workspace/repos/*/` for `.ambient/config.json`. If present, it reads and applies the configuration. If absent, nothing happens. If multiple cloned repos have `.ambient/config.json` with learning enabled, the runner warns and applies only the first one found.

The target is the repo that contains the `.ambient/config.json` — PRs go to the same repo. The CL system prompt instructions include `cd <target-repo-path>` so Claude runs git/gh commands in the correct repo directory.

**Workspace flag evaluation**: The runner reads the `CONTINUOUS_LEARNING_ENABLED` environment variable (set on the pod by the backend when the workspace flag is enabled). This avoids an async backend API call during session startup for faster initialization.

**Config discovery notification**: When `.ambient/config.json` is discovered and CL is activated, the runner emits a `config:discovered` AG-UI custom event. The frontend displays a toast notification showing the repo name and enabled features (e.g., "Discovered .ambient/config.json in my-repo — Enabled: learning").

### Wiki Compilation

The llm-wiki-compiler compiles the **entire `docs/` tree** plus `ARCHITECTURE.md`:

Human-authored design docs, the architecture codemap, product specs, references, AND machine-learned corrections all get synthesized into one coherent wiki. Coverage indicators show what's well-documented (5+ sources across authored + learned) vs. sparse.

For the **ambient-action** compilation path, no config file is needed — the compilation prompt tells the session what to compile and where to write. For the **standalone GHA** alternative (using llm-wiki-compiler directly), a `.wiki-compiler.json` is needed:

```json
// .wiki-compiler.json (optional — only needed for standalone GHA path)
{
  "sources": [
    {"path": "docs/", "exclude": ["wiki/"]},
    {"path": "ARCHITECTURE.md"}
  ],
  "output": "docs/wiki/"
}
```

**Two compilation workflows ship in the example repo:**

1. **Active: `compile-wiki-ambient.yml`** — ambient-action path. Auto-triggers on push to `docs/**` or `ARCHITECTURE.md` on main. Creates an ACP session to run compilation. Requires `AMBIENT_API_URL` and `AMBIENT_BOT_TOKEN` secrets.

2. **Inert: `compile-wiki.yml`** — standalone GHA. Manual trigger only via `workflow_dispatch`. Complete standalone implementation with no ACP dependency. Requires only `ANTHROPIC_API_KEY` secret. Includes optional `force` input to bypass incremental cache. For demos, testing, and repos without ACP access.

Users enable whichever fits their setup. The ambient-action path is recommended for ACP users.

The compilation session is just another ACP session — it has Claude, the full repo, and push access. No special tooling needs to be installed in developer sessions. Developer sessions just read the compiled output (`docs/wiki/INDEX.md`) from the repo.

**Alternative: standalone GitHub Action** (for users without ACP access). The example repo should also document a pure-GHA approach that runs the llm-wiki-compiler directly without the ambient-action. Both options should be documented; the ambient-action approach is recommended for ACP users.

### Data Flow

```
Correction/Explicit capture
    → Claude silently creates branch + writes docs/learned/ file + gh pr create --draft
    → Team triages draft PRs (merge = keep, close = discard)
    → On merge: GHA runs llm-wiki-compiler on docs/ + ARCHITECTURE.md
    → Compiled wiki committed to docs/wiki/
    → Next session: runner reads docs/wiki/INDEX.md → appended to system prompt
```

### System Prompt Injection

The runner's `resolve_workspace_prompt()` in `platform/prompts.py` handles injection:

1. Check if `continuous-learning.enabled` workspace flag is on
2. Check if `docs/wiki/INDEX.md` exists in any cloned repo
3. If both: append instructions to the system prompt, telling Claude to read the wiki INDEX, use coverage indicators, and fall back to raw sources for low-coverage sections
4. If either is missing: no injection, no error

This follows the existing pattern for conditional prompt sections (e.g., GitHub token availability triggers git push instructions).

## User Scenarios & Testing

### User Story 1 - Automatic Correction Capture (Priority: P1)

A developer is working in an ACP session. Claude produces output that the developer rejects or redirects ("no, do it this way", "that's wrong, use X instead"). Claude detects the correction via its existing correction detection logic and silently creates a draft PR with a structured markdown file in `docs/learned/corrections/`. The developer is not interrupted — the PR shows up for triage later.

**Why this priority**: Corrections are the highest-signal learning events. They happen naturally, require no extra effort from the user, and capture knowledge that prevents the same mistake in future sessions.

**Independent Test**: Can be tested by starting a session with Continuous Learning enabled, issuing a directive, rejecting Claude's approach with a correction, and verifying a draft PR appears with a well-structured markdown file.

**Acceptance Scenarios**:

1. **Given** a session with Continuous Learning enabled (both workspace flag and repo config), **When** the user rejects Claude's output and provides a correction, **Then** a draft PR is silently created containing a markdown file in `docs/learned/corrections/` with the original approach, the correction, and the reasoning.
2. **Given** a session with Continuous Learning enabled, **When** the user provides positive feedback or no correction, **Then** no draft PR is created.
3. **Given** a session with Continuous Learning disabled (flag off or no repo config), **When** the user provides a correction, **Then** no draft PR is created.

---

### User Story 2 - Explicit Capture (Priority: P1)

A developer learns something important during a session — a pattern, a gotcha, a convention — and wants to save it to the repository's institutional knowledge. They say "save this to learned" (or equivalent trigger) and a draft PR is created with a markdown file capturing the knowledge.

**Why this priority**: Explicit capture complements automatic correction detection. Some knowledge doesn't come from corrections — it comes from discoveries, decisions, or patterns the developer wants to preserve. Equal priority because both are minimal-effort capture mechanisms.

**Independent Test**: Can be tested by starting a session with Continuous Learning enabled, saying "save this to learned: always use snake_case for SDK options because they map to Python kwargs", and verifying a draft PR appears with a well-structured markdown file.

**Acceptance Scenarios**:

1. **Given** a session with Continuous Learning enabled, **When** the user says "save this to learned" followed by content, **Then** a draft PR is created containing a markdown file in `docs/learned/` with the captured knowledge.
2. **Given** a session with Continuous Learning enabled, **When** the user explicitly saves knowledge, **Then** the file is categorized appropriately (correction, pattern, convention) based on its content.
3. **Given** a session with Continuous Learning disabled, **When** the user tries to save knowledge, **Then** the system informs the user that Continuous Learning is not enabled for this workspace.

---

### User Story 3 - Repo Configuration via .ambient/config.json (Priority: P1)

A repo maintainer adds `.ambient/config.json` to their repository with learning configuration. When ACP sessions clone this repo, the runner reads the config and activates learning capture if the workspace flag is also enabled. This is a one-time setup per repo.

**Why this priority**: P1 because correction capture and explicit capture (Stories 1 and 2) cannot function without repo-level configuration. The runner needs `.ambient/config.json` to know learning is enabled and to inject the system prompt instructions. This is a prerequisite for all capture.

**Independent Test**: Can be tested by adding `.ambient/config.json` to a repo, starting a session in a workspace with `continuous-learning.enabled`, and verifying learning capture is active.

**Acceptance Scenarios**:

1. **Given** a repo with `.ambient/config.json` containing learning config and a workspace with `continuous-learning.enabled` on, **When** a session starts and clones the repo, **Then** learning capture instructions are injected into the system prompt.
2. **Given** a repo without `.ambient/config.json`, **When** a session starts, **Then** no learning capture is active regardless of the workspace flag.
3. **Given** a repo with `.ambient/config.json` but the workspace flag is off, **When** a session starts, **Then** no learning capture is active.

---

### User Story 4 - Reviewing and Merging Learned Knowledge (Priority: P2)

A team lead or developer reviews draft PRs created by Continuous Learning. Each PR contains a single markdown file with a learning event. The reviewer reads the content, decides if it's worth preserving, and either merges or closes. Merged files accumulate in `docs/learned/` as part of the repository's institutional knowledge.

**Why this priority**: The triage process turns raw captures into curated knowledge. Without it, `docs/learned/` fills with noise. This is a human workflow — the PR format must support efficient review.

**Independent Test**: Can be tested by reviewing a learning draft PR, verifying it contains clear context (what happened, what was learned, why it matters), and confirming the merge adds the file to `docs/learned/`.

**Acceptance Scenarios**:

1. **Given** a learning draft PR exists, **When** a reviewer opens it, **Then** the PR description and file content provide enough context to decide whether to keep or discard.
2. **Given** a learning draft PR is merged, **When** the merge completes, **Then** the markdown file is present in `docs/learned/` on the target branch.
3. **Given** multiple learning draft PRs exist, **When** a reviewer views the PR list, **Then** learning PRs are identifiable by their branch naming convention and labels.

---

### User Story 5 - Automated Wiki Compilation (Priority: P2)

When any file under `docs/` or `ARCHITECTURE.md` changes on the target branch (including merged learning PRs), a GitHub Action triggers the llm-wiki-compiler to recompile the entire `docs/` tree plus `ARCHITECTURE.md` into topic-based wiki articles at `docs/wiki/`. The compiled wiki is committed back to the repo so it's always fresh for the next session.

**Why this priority**: Without compilation, sessions have to scan all raw docs files. The compiler synthesizes everything — architecture, human-authored docs, AND learned knowledge — into a handful of topic articles with coverage indicators. Same knowledge, fraction of the token cost.

**Independent Test**: Can be tested by merging a learning PR and verifying the GHA runs, the wiki is updated, and the compiled articles reflect both existing docs and the new learned content.

**Acceptance Scenarios**:

1. **Given** a file under `docs/` or `ARCHITECTURE.md` is merged to the target branch, **When** the merge completes, **Then** a GitHub Action runs the llm-wiki-compiler and commits updated wiki articles to `docs/wiki/`.
2. **Given** the compiled wiki exists, **When** a new session starts, **Then** the session can read `docs/wiki/INDEX.md` and topic articles instead of scanning all raw files.
3. **Given** no docs files have changed since the last compile, **When** the GHA is triggered, **Then** the compiler detects no changes and skips recompilation.

---

### User Story 6 - System Prompt Injection (Priority: P2)

When Continuous Learning is enabled for a workspace and a compiled wiki exists in the repo, ACP's runner automatically injects wiki context into the session's system prompt via `resolve_workspace_prompt()`. The agent is told where the wiki is, how to use coverage indicators, and when to fall back to raw source files. No manual CLAUDE.md editing is required.

**Why this priority**: This closes the loop — all repository knowledge (architecture, authored docs, learned knowledge) flows into future sessions automatically.

**Independent Test**: Can be tested by starting a session in a workspace with Continuous Learning enabled and a compiled wiki, then verifying the system prompt contains the wiki context.

**Acceptance Scenarios**:

1. **Given** a workspace with Continuous Learning enabled and a compiled wiki at `docs/wiki/`, **When** a session starts, **Then** the system prompt includes instructions to read `docs/wiki/INDEX.md` and use coverage indicators.
2. **Given** a workspace with Continuous Learning enabled but no compiled wiki yet, **When** a session starts, **Then** no wiki context is injected (graceful absence).
3. **Given** a workspace with Continuous Learning disabled, **When** a session starts, **Then** no wiki context is injected regardless of whether `docs/wiki/` exists.

---

### User Story 7 - Triage Dashboard (Priority: P2)

A team lead opens the existing PR triage dashboard (`~/repos/dashboards/triage`) and sees a dedicated "Learned" section showing all open learning draft PRs. Each PR displays the learned knowledge file content inline for quick review. The reviewer can merge (keep the knowledge), close (discard), or skip — same action model as existing PR sections. Bulk operations allow triaging a batch of learning PRs in one pass.

**Why this priority**: The triage dashboard already exists and is the team's workflow for PR management. Learning PRs should appear alongside other PR triage work, not in a separate tool.

**Independent Test**: Can be tested by creating several learning draft PRs, loading the triage dashboard, and verifying the Learned section appears with the correct PRs, inline content preview, and working merge/close/skip actions.

**Acceptance Scenarios**:

1. **Given** open learning draft PRs exist on the target repo, **When** a reviewer loads the triage dashboard, **Then** a "Learned" section appears listing all learning draft PRs with their titles, authors, and creation dates.
2. **Given** a learning PR in the triage dashboard, **When** the reviewer expands it, **Then** the learned knowledge file content is displayed inline.
3. **Given** a learning PR in the triage dashboard, **When** the reviewer selects "Merge" and executes, **Then** the PR is squash-merged and the file lands in `docs/learned/` on the target branch.
4. **Given** multiple learning PRs in the triage dashboard, **When** the reviewer uses bulk merge, **Then** all selected PRs are merged sequentially with activity log entries for each.

---

### User Story 8 - Example Repository (Priority: P2)

As part of this feature, a functional standalone example repository is generated that demonstrates the full Continuous Learning wiring end-to-end. The example repo is a small but real, working codebase (e.g., a simple API service with tests) — not a skeleton or placeholder. It contains: `.ambient/config.json`, `ARCHITECTURE.md`, `.wiki-compiler.json`, a `docs/` structure with human-authored design docs and references that describe the example codebase, and several realistic `docs/learned/` markdown files representing corrections and patterns that would plausibly emerge from developing that codebase. The learned files are submitted as draft PRs to the example repo, demonstrating the complete capture-to-triage flow.

**Why this priority**: P2 because it's a validation artifact and demo, not core functionality. Built after the capture mechanism and configuration work. Serves as an acceptance test for the full pipeline.

**Independent Test**: Can be tested by cloning the example repo, verifying it has all configuration files, that draft PRs exist with realistic learned knowledge, and that the wiki compiles from the full `docs/` tree.

**Acceptance Scenarios**:

1. **Given** the example repository, **When** a developer clones it, **Then** it contains `.ambient/config.json`, `ARCHITECTURE.md`, `.wiki-compiler.json`, and a complete `docs/` structure.
2. **Given** the example repository, **When** a developer inspects `docs/learned/`, **Then** it contains realistic correction and pattern files with proper frontmatter that represent plausible development learnings.
3. **Given** the example repository, **When** a developer views open PRs, **Then** draft PRs exist with learned knowledge files, demonstrating the capture-to-triage flow.
4. **Given** the example repository, **When** a developer runs the wiki compiler, **Then** `docs/wiki/` is generated from the full `docs/` tree including `ARCHITECTURE.md` and `docs/learned/`.

---

### Edge Cases

- What happens when a session is interrupted before a correction PR can be created? The correction is lost — acceptable for v1.
- What happens when the user provides ambiguous feedback that might or might not be a correction? Claude errs on the side of not offering to save. False negatives are preferable to noisy false positives.
- What happens when the target repository is not accessible (permissions, network)? PR creation fails silently and logs the error. It must not interrupt the developer's session.
- What happens when multiple corrections occur in rapid succession? Each gets its own branch and draft PR. No batching in v1.
- What happens when `docs/learned/` does not yet exist in the repository? The first PR creates the directory structure.
- What happens when a learning branch name collides with an existing branch? The system appends a short hash or sequence number to ensure uniqueness.
- What happens when wiki compilation fails (LLM error, token limit)? The GHA logs the failure and the previous compiled wiki remains in place. Raw files are still available as fallback.
- What happens when the compiled wiki is stale (source files changed but GHA hasn't run)? Sessions use whatever wiki version is on disk. Coverage indicators help the agent judge trustworthiness.
- What happens when `.ambient/config.json` has invalid or missing learning config? The runner logs a warning and skips learning activation. No session impact.
- What happens when the session has no repo cloned? Learning capture is not available — no target for PRs.
- What happens when `docs/` exists but has no `learned/` subdirectory? The wiki compiles whatever docs exist. Learned knowledge accumulates once the first learning PR is merged.
- What happens when a repo has `ARCHITECTURE.md` but no `docs/` directory? The wiki compiles `ARCHITECTURE.md` alone. `docs/` is created by the first learning PR.

## Requirements

### Functional Requirements

- **FR-001**: System MUST detect user corrections during a session by extending the existing `CORRECTION_DETECTION_INSTRUCTIONS` in `prompts.py` with Continuous Learning-specific logic.
- **FR-002**: When a correction is detected and Continuous Learning is enabled, the system MUST silently create a draft PR containing a markdown file in `docs/learned/corrections/` with the original approach, the correction, and the reasoning. No user confirmation prompt.
- **FR-003**: System MUST allow users to explicitly save knowledge via a natural language trigger ("save this to learned: <content>") during a session, silently creating a draft PR.
- **FR-004**: Each learned knowledge file MUST include structured frontmatter: `type` (correction, pattern), `date` (ISO8601), `session` (from `AGENTIC_SESSION_NAME` env var), `project` (from `PROJECT_NAME` env var), `author` (from `git config user.name` in the target repo), and `title` (human-readable summary).
- **FR-005**: System MUST read `.ambient/config.json` from cloned repos during session setup to determine learning configuration. If multiple cloned repos contain `.ambient/config.json` with learning enabled, the system MUST warn and apply only the first one found.
- **FR-006**: Continuous Learning MUST require two gates for activation: workspace-level `continuous-learning.enabled` feature flag AND repo-level `.ambient/config.json` with `learning.enabled: true`.
- **FR-007**: Draft PR branches MUST use the convention `learned/<type>-<date>-<short-description>`. Draft PRs MUST always be draft (never merge-ready). Draft PRs MUST be labeled `continuous-learning` for dashboard filtering. The label MUST be created on the repo if it doesn't exist.
- **FR-008**: Learning capture (both correction and explicit) MUST NOT interrupt or degrade the developer's session. PR creation is silent — no confirmation prompts. Failures are logged but do not surface to the user.
- **FR-009**: Learned knowledge MUST be stored in `docs/learned/` with subdirectories for categorization: at minimum `corrections/` for corrections and categorized placement for explicit captures.
- **FR-010**: System MUST compile the entire `docs/` tree plus `ARCHITECTURE.md` (excluding `docs/wiki/`) into topic-based wiki articles, triggered when files under `docs/` or `ARCHITECTURE.md` change on the target branch. The recommended approach uses the `ambient-action` to run compilation as an ACP session. A standalone GHA alternative MUST also be documented.
- **FR-011**: Compiled wiki output MUST be committed back to the repository at `docs/wiki/` so it is available at session start without runtime compilation.
- **FR-012**: The runner's `resolve_workspace_prompt()` MUST inject wiki context into the system prompt when Continuous Learning is enabled for a workspace and a compiled wiki exists, instructing the agent to read the wiki INDEX, use coverage indicators, and fall back to raw sources for low-coverage sections.
- **FR-013**: System prompt injection MUST be graceful — no injection when the wiki doesn't exist yet, and no errors when Continuous Learning is disabled.
- **FR-014**: The existing PR triage dashboard (`~/repos/dashboards/triage`) MUST be extended with a "Learned" section that dynamically fetches open learning draft PRs from the target repo, filtered by the `continuous-learning` label.
- **FR-015**: The triage "Learned" section MUST display learned knowledge file content inline so reviewers can read and decide without leaving the dashboard.
- **FR-016**: The triage "Learned" section MUST support the same action model as existing sections: merge, close, skip, and bulk operations.
- **FR-017**: System MUST generate a functional standalone example repository — a small working codebase with `.ambient/config.json`, `ARCHITECTURE.md`, `docs/` structure (including human-authored docs describing the example codebase), and realistic `docs/learned/` files submitted as draft PRs. MUST also provide an example `.ambient/config.json` for the ACP platform repository.
- **FR-018**: The example repository MUST be a real, functional codebase (e.g., a simple API service with tests), not a skeleton or placeholder. The learned knowledge files must be plausible corrections and patterns that would emerge from developing that specific codebase.

### Key Entities

- **Learning Event**: A captured piece of knowledge — either a correction or an explicit save. Contains: type, content (what was learned), context (what prompted it), date, session identifier.
- **Learned Knowledge File**: A markdown file in `docs/learned/` with YAML frontmatter. The on-disk representation of a learning event after human approval via PR merge.
- **Ambient Config**: `.ambient/config.json` in a repository. Declares repo-level ACP integrations including learning configuration (`learning.enabled: true`).
- **Compiled Wiki**: The `docs/wiki/` directory containing an INDEX.md and topic articles with coverage indicators. Generated by the llm-wiki-compiler from the entire `docs/` tree plus `ARCHITECTURE.md`, never edited manually.
- **Wiki Compiler Configuration**: An optional `.wiki-compiler.json` in the repo root, only needed for the standalone GHA compilation path. The ambient-action path receives compilation instructions via the session prompt.

## Success Criteria

### Measurable Outcomes

- **SC-001**: Corrections detected during a session result in a draft PR within 30 seconds of the correction event.
- **SC-002**: Explicit saves result in a draft PR within 10 seconds of the user's request.
- **SC-003**: 80% of draft PRs contain enough context for a reviewer to make a keep/discard decision without returning to the original session.
- **SC-004**: A new repository can be configured for Continuous Learning (add `.ambient/config.json`, enable flag) within 5 minutes.

## Development Methodology

### TDD + Gated Requirement Evals

Development follows the speckit TDD approach (tests first, then implementation). In addition, **strategic eval checkpoints** are placed at the boundary of each user story and each functional requirement. These evals are hard gates — implementation cannot proceed to the next requirement or story until the current one's eval passes.

### Eval Structure

Each eval is a **deterministic, executable assertion** — a script or test with a concrete exit code (0 = PASS, non-zero = FAIL). Evals are not LLM judgment calls. They cannot be skipped, reasoned around, or marked as "good enough" by the agent. If an eval fails, the agent must fix the issue and re-run until it passes.

Evals verify that a specific requirement (FR-xxx) or acceptance scenario is fully satisfied. They are not unit tests — they are higher-level assertions that validate the requirement's intent, not just its mechanics. They may exercise multiple components together. But they must always produce a binary pass/fail result from observable, deterministic criteria (file exists, PR was created, HTTP status returned, string present in output, etc.).

### Eval Log

All eval runs are logged verbosely to `specs/001-continuous-learning/eval-log.md` with the following structure per entry:

```markdown
## EVAL-<timestamp> — <FR-xxx or Story N, Scenario M>

**Requirement**: <requirement text>
**Branch**: <branch name>
**Git SHA**: <commit hash at time of eval>
**Status**: PASS | FAIL
**Duration**: <elapsed>
**Eval Prompt**: <the exact eval assertion/command/script that was executed>
**Evidence**:
  - <what was checked>
  - <what was observed>
  - <relevant output, file paths, PR URLs>

**Failure Detail** (if FAIL):
  - <what was expected>
  - <what actually happened>
  - <root cause if known>
```

### Gate Rules

1. Each functional requirement (FR-001 through FR-018) has at least one eval.
2. Each acceptance scenario has a corresponding eval assertion.
3. An eval MUST pass before work begins on the next requirement or story in dependency order.
4. If an eval fails, the failure is logged, the issue is fixed, and the eval is re-run. The re-run is also logged (full history, not just latest).
5. The eval log is cumulative — it grows throughout development and serves as an audit trail of requirement satisfaction.

### Eval Placement Strategy

- **After each FR implementation**: verify that specific FR is satisfied
- **After each user story completion**: run all acceptance scenario evals for that story
- **Before moving to next priority tier** (P1 → P2 → P3): run all evals for the completed tier as a regression gate
- **Before PR creation**: full eval suite as a final gate

## Assumptions

- GitHub is the PR target for v1. Other forges are out of scope.
- The session environment has `gh` CLI installed and authenticated via PAT credential helper at `/tmp/.ambient_github_token`.
- Correction detection reuses the existing `CORRECTION_DETECTION_INSTRUCTIONS` and `log_correction` infrastructure in the runner — extending it, not replacing it.
- No new tools or hooks are needed. Continuous Learning operates via system prompt instructions and existing CLI tools (`git`, `gh`).
- The llm-wiki-compiler plugin (github.com/ussumant/llm-wiki-compiler) is used as-is for compilation. Continuous Learning does not reimplement the compiler.
- Compilation runs via GitHub Action, not at session start — avoids adding latency and token cost to session startup.
- The wiki compiles the ENTIRE `docs/` tree plus `ARCHITECTURE.md`, not just `docs/learned/`. Human-authored docs and machine-learned knowledge are compiled together.
- `.ambient/config.json` is the standard location for repo-level ACP integration configuration. This is a new convention being established with Continuous Learning as the first consumer.
- Repos that don't have a `docs/` directory yet will get one created by the first learning PR. Existing `docs/` directories are preserved and compiled alongside learned knowledge.
- `ARCHITECTURE.md` at the repo root follows the matklad convention: bird's-eye codemap of modules, invariants, and cross-cutting concerns. Maintained loosely by humans, revised a few times yearly. Compiled into the wiki alongside everything else.

## Prior Art & References

The example repository's README MUST cite the following precedents that inform this feature's design:

- **Claude Code Memory** — https://code.claude.com/docs/en/memory — Claude Code's local memory system (markdown files with frontmatter, auto-detection of corrections, session-start injection). Continuous Learning replicates this pattern but makes it hosted, shared, and human-curated via PRs.
- **Harness Engineering (OpenAI)** — https://openai.com/index/harness-engineering/ — The `docs/` directory structure (AGENTS.md, ARCHITECTURE.md, design-docs/, product-specs/, references/) that serves as the agent's runtime context. Continuous Learning adopts this structure and adds `docs/learned/` as the continuously-captured layer.
- **ARCHITECTURE.md (matklad)** — https://matklad.github.io/2021/02/06/ARCHITECTURE.md.html — The convention of a bird's-eye codemap at the repo root: coarse-grained modules, architectural invariants, cross-cutting concerns. Maintained loosely, not synced on every commit.
- **LLM Knowledge Base (Karpathy)** — https://x.com/karpathy/status/2039805659525644595 — The knowledge compilation pattern: scattered source files compiled by an LLM into a topic-based wiki, operated on by CLIs, viewable in Obsidian. Raw data → compiled knowledge → queryable wiki.
- **llm-wiki-compiler** — https://github.com/ussumant/llm-wiki-compiler — Claude Code plugin implementing Karpathy's pattern. Compiles markdown sources into topic articles with coverage indicators and cross-cutting concept discovery.
- **Cognee: Memory as the Moat** — The framing that most bottlenecks in agentic systems are memory problems: continual learning, context engineering, and multi-agent coordination all reduce to deciding what to keep, how to merge it, and how to reuse it.

## Out of Scope

- RAG integration or vector database storage
- Session outcome tracking
- Pattern detection across sessions
- Auto-merge / yolo mode
- Non-GitHub forges
- Per-session enable/disable toggle
- Custom compiler implementation (uses llm-wiki-compiler as-is)
- New tools or hooks (uses system prompt instructions + existing CLI tools)
- Migrating existing human-authored docs into the `docs/` structure (repos adopt at their own pace)
- Creating or maintaining `ARCHITECTURE.md` content (human-authored, this feature just compiles it)

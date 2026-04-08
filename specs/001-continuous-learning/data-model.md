# Data Model: Continuous Learning

## Entities

### LearningEvent (transient — exists only during session)

A captured piece of knowledge detected by Claude during a session. Not persisted as a data structure — it materializes as a branch + file + draft PR.

| Field | Type | Source | Description |
|-------|------|--------|-------------|
| type | `"correction" \| "pattern"` | Claude detection | Category of learning |
| title | string | Claude-generated | Short human-readable summary |
| date | ISO8601 string | System clock | Timestamp of capture |
| session | string | `AGENTIC_SESSION_NAME` env | Session identifier |
| project | string | `PROJECT_NAME` env | Workspace/project name |
| author | string | Git config `user.name` | Who triggered the learning |

**Not stored anywhere as structured data** — the event is ephemeral. Claude writes it directly to a markdown file with YAML frontmatter.

### LearnedKnowledgeFile (on-disk artifact)

A markdown file in `docs/learned/` with YAML frontmatter. Created by Claude during a session, submitted as a draft PR.

```yaml
---
type: correction | pattern
date: "2026-04-08T14:30:00Z"
session: "abc123"
project: "my-project"
author: "Jeremy Eder"
title: "Always use snake_case for SDK options"
---

## What Happened
<what Claude did>

## The Correction
<what the user said to do instead>

## Why It Matters
<reasoning, context, implications>
```

**Storage path**: `docs/learned/corrections/<filename>.md` or `docs/learned/patterns/<filename>.md`
**Filename convention**: `<YYYY-MM-DD>-<short-description>.md` (e.g., `2026-04-08-sdk-options-snake-case.md`)

### AmbientRepoConfig (.ambient/config.json)

Repo-level ACP integration configuration. New convention — CL is the first consumer.

```json
{
  "learning": {
    "enabled": true
  }
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| learning | object | No | `{}` | Learning configuration block |
| learning.enabled | boolean | No | `false` | Enable continuous learning for this repo |

**Validation rules**:
- File is optional — absence means no learning
- Invalid JSON: log warning, skip learning activation
- Missing `learning` key: no learning
- Missing `learning.enabled`: no learning
- Extra keys ignored (forward-compatible)

### WikiCompilerConfig (.wiki-compiler.json)

Configuration for the llm-wiki-compiler. Optional — only needed for standalone GHA compilation path.

```json
{
  "version": 1,
  "name": "Project Name",
  "sources": [
    {"path": "docs/", "exclude": ["wiki/"]},
    {"path": "ARCHITECTURE.md"}
  ],
  "output": "docs/wiki/"
}
```

### CompiledWiki (docs/wiki/)

Auto-generated directory. Never edited manually.

```
docs/wiki/
├── INDEX.md              # Topic directory with coverage counts
├── topics/
│   └── <topic>.md        # Topic articles with coverage indicators
├── concepts/
│   └── <concept>.md      # Cross-cutting patterns (3+ topics)
├── schema.md             # Wiki structure definition
└── .compile-state.json   # Last compilation metadata
```

### FeatureFlag (continuous-learning.enabled)

Workspace-scoped feature flag in Unleash.

```json
{
  "name": "continuous-learning.enabled",
  "description": "Enable continuous learning capture and wiki injection for workspace sessions",
  "tags": [{"type": "scope", "value": "workspace"}]
}
```

**Evaluation**: Three-state — ConfigMap override (per workspace) > Unleash default (global)

### DraftPR (GitHub)

The draft PR created by Claude for each learning event.

| Attribute | Value |
|-----------|-------|
| State | Always draft |
| Branch | `learned/<type>-<YYYY-MM-DD>-<short-description>` |
| Title | `learned: <title from frontmatter>` |
| Label | `continuous-learning` |
| Body | Auto-generated summary of the learned knowledge |
| Files changed | Single file in `docs/learned/` |

## State Transitions

```
Session Active + CL Enabled
    → Correction detected OR explicit save
    → Branch created: learned/<type>-<date>-<desc>
    → File written: docs/learned/<category>/<file>.md
    → Draft PR created with continuous-learning label
    → PR appears in triage dashboard

Triage
    → Reviewer merges PR → file lands in docs/learned/ on main
    → Reviewer closes PR → learning discarded, branch deleted
    → Reviewer skips → PR remains for later review

Wiki Compilation (on docs/ change to main)
    → GHA triggers compilation
    → llm-wiki-compiler reads all docs/ + ARCHITECTURE.md
    → Writes compiled wiki to docs/wiki/
    → Commits back to repo

Next Session
    → Runner checks CL flag + repo config
    → If wiki exists: injects wiki context into system prompt
    → Session benefits from all accumulated knowledge
```

## Relationships

```
AmbientRepoConfig --enables--> LearningEvent capture
FeatureFlag --gates--> LearningEvent capture
LearningEvent --creates--> LearnedKnowledgeFile
LearnedKnowledgeFile --submitted-as--> DraftPR
DraftPR --merged-into--> docs/learned/ on main
docs/learned/ --compiled-by--> WikiCompilerConfig
WikiCompilerConfig --produces--> CompiledWiki
CompiledWiki --injected-into--> next session system prompt
```

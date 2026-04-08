# Continuous Learning — Architecture

## End-to-End Flow

```mermaid
flowchart TD
    subgraph SETUP["One-Time Setup"]
        S1["Add .ambient/config.json\nto your repo"] --> S2["Enable continuous-learning.enabled\nin workspace settings"]
    end

    subgraph SESSION["ACP Session"]
        S2 -.-> A1[Session starts\nRunner clones repo]
        A1 --> A2["Runner reads .ambient/config.json\n+ checks workspace flag"]
        A2 --> A3["CL instructions injected\ninto system prompt"]
        A3 --> A4{"docs/wiki/INDEX.md\nin repo?"}
        A4 -->|Yes| A5["Wiki context also injected\n(coverage indicators)"]
        A4 -->|No| A6[Wiki injection skipped]
        A5 --> A7[Developer works normally]
        A6 --> A7
    end

    subgraph CAPTURE["Silent Capture"]
        A7 --> B1{"Developer corrects Claude\nOR says 'save this to learned'"}
        B1 -->|Correction| B2["Claude silently:\n1. Creates learned/* branch\n2. Writes docs/learned/corrections/*.md\n3. Runs gh pr create --draft"]
        B1 -->|Explicit save| B3["Claude silently:\n1. Creates learned/* branch\n2. Writes docs/learned/patterns/*.md\n3. Runs gh pr create --draft"]
        B1 -->|Neither| B4[No capture — continue working]
        B2 --> B5[Draft PR with\ncontinuous-learning label]
        B3 --> B5
    end

    subgraph TRIAGE["Triage Dashboard"]
        B5 --> C1["Learned Knowledge section\nshows all CL draft PRs"]
        C1 --> C2["Reviewer reads inline\nmarkdown content"]
        C2 --> C3{Decision}
        C3 -->|"Merge (keep)"| C4["Knowledge lands in\ndocs/learned/ on main"]
        C3 -->|"Close (discard)"| C5[PR closed\nbranch deleted]
        C3 -->|Skip| C6[Review later]
    end

    subgraph COMPILE["Wiki Compilation"]
        C4 --> D1["GHA triggers on\ndocs/ change to main"]
        D1 --> D2["llm-wiki-compiler\nreads full docs/ tree\n+ ARCHITECTURE.md"]
        D2 --> D3["Compiled wiki committed\nto docs/wiki/"]
    end

    D3 -.->|"Next session\nreads compiled wiki"| A1

    style SETUP stroke:#3b82f6,stroke-width:2px
    style SESSION stroke:#6366f1,stroke-width:2px
    style CAPTURE stroke:#8b5cf6,stroke-width:2px
    style TRIAGE stroke:#f59e0b,stroke-width:3px
    style COMPILE stroke:#22c55e,stroke-width:2px
```

## TLDR

1. Add `{"learning": {"enabled": true}}` as `.ambient/config.json` to your repo
2. Enable `continuous-learning.enabled` flag in workspace settings
3. Draft PRs appear on your repo automatically — triage them in the dashboard

## How Draft PRs Are Created

Claude executes these git/gh commands silently inside the session pod:

```bash
# 1. Save current branch
ORIGINAL=$(git branch --show-current)

# 2. Create learned branch
git checkout -b learned/correction-2026-04-08-use-pydantic-models

# 3. Ensure label exists
gh label create continuous-learning --force

# 4. Write the learned file
mkdir -p docs/learned/corrections/
cat > docs/learned/corrections/2026-04-08-use-pydantic-models.md << 'EOF'
---
type: correction
date: "2026-04-08T14:30:00Z"
session: "abc123"
project: "my-project"
author: "Jeremy Eder"
title: "Use Pydantic models for request bodies"
---
## What Happened
Used a plain dict for the PATCH request body.
## The Correction
User said to always use Pydantic models for request bodies.
## Why It Matters
Pydantic provides validation, serialization, and OpenAPI schema generation.
EOF

# 5. Commit and push
git add docs/learned/
git commit -m "learned: Use Pydantic models for request bodies"
git push -u origin learned/correction-2026-04-08-use-pydantic-models

# 6. Create draft PR
gh pr create --draft \
  --title "learned: Use Pydantic models for request bodies" \
  --label continuous-learning \
  --body "Automatic correction capture from session abc123"

# 7. Return to working branch
git checkout "$ORIGINAL"
```

The developer never sees any of this. If any step fails, it's logged and the session continues normally.

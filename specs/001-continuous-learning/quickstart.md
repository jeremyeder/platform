# Quickstart: Continuous Learning

## For Repo Owners (enable CL on your repo)

### 1. Add repo config

Create `.ambient/config.json` in your repo root:

```json
{
  "learning": {
    "enabled": true
  }
}
```

### 2. Enable the workspace flag

In the ACP workspace settings UI, enable **continuous-learning.enabled** for your workspace.

### 3. (Optional) Set up wiki compilation

Add `.wiki-compiler.json` to your repo root:

```json
{
  "version": 1,
  "name": "Your Project",
  "sources": [
    {"path": "docs/", "exclude": ["wiki/"]},
    {"path": "ARCHITECTURE.md"}
  ],
  "output": "docs/wiki/"
}
```

Copy `.github/workflows/compile-wiki.yml` from the example repo to enable automatic wiki compilation on merge.

### 4. Start a session

Create a new ACP session in the workspace. Claude will silently capture corrections and respond to "save this to learned" requests. Draft PRs appear on your repo for triage.

## For Developers (using CL in sessions)

### Automatic capture

Just work normally. When you correct Claude ("no, do it this way"), it silently creates a draft PR with the correction. You won't see any interruption.

### Explicit capture

Say "save this to learned: <knowledge>" to explicitly save a pattern, convention, or gotcha. Claude creates a draft PR and briefly acknowledges.

### What gets captured

- Corrections: when you redirect Claude's approach
- Patterns: when you explicitly save knowledge
- NOT captured: trivial commands, session-specific preferences, information already in docs

## For Reviewers (triaging learned knowledge)

### Via GitHub

1. Filter PRs by the `continuous-learning` label
2. Each PR has a single file in `docs/learned/`
3. Read the file — it has structured sections (What Happened, The Correction, Why It Matters)
4. Merge to keep, close to discard

### Via Triage Dashboard

1. Open the triage dashboard
2. Navigate to the "Learned Knowledge" section
3. Review inline content for each draft PR
4. Merge, close, or skip — same workflow as other PR triage

## For Platform Developers (testing locally)

### Prerequisites

- Local kind cluster running (`make kind-up LOCAL_IMAGES=true CONTAINER_ENGINE=docker`)
- `continuous-learning.enabled` flag synced to Unleash

### Test correction capture

1. Enable the flag for a test workspace
2. Create a test repo with `.ambient/config.json`
3. Start a session
4. Ask Claude to do something, then correct it
5. Check for draft PR on the test repo

### Test wiki compilation

1. Run the wiki compiler skill: `/wiki-compile`
2. Or trigger the GHA manually
3. Verify `docs/wiki/INDEX.md` is generated

# Contract: Wiki Compilation GitHub Actions

The example repo ships **both** workflows. Users enable whichever fits their setup.

## 1. Active: ambient-action (auto-trigger on push)

**File**: `.github/workflows/compile-wiki-ambient.yml`

The production path for ACP users. Auto-triggers on push to `docs/` or `ARCHITECTURE.md`. Creates an ACP session to run compilation.

```yaml
name: Compile Wiki (Ambient)
on:
  push:
    branches: [main]
    paths: ['docs/**', 'ARCHITECTURE.md']

jobs:
  compile:
    runs-on: ubuntu-latest
    steps:
      - uses: ambient-code/ambient-action@v2
        with:
          api-url: ${{ secrets.AMBIENT_API_URL }}
          api-token: ${{ secrets.AMBIENT_BOT_TOKEN }}
          project: ${{ github.repository }}
          prompt: |
            Compile docs/wiki/ from the full docs/ tree and ARCHITECTURE.md.
            Read all source files, synthesize into topic-based articles with
            coverage indicators, write INDEX.md and topic files to docs/wiki/.
            Commit and push.
          repos: '[{"url": "${{ github.server_url }}/${{ github.repository }}", "branch": "${{ github.ref_name }}", "autoPush": true}]'
          wait: 'true'
```

**Trigger**: Automatic on push to main touching `docs/**` or `ARCHITECTURE.md`
**Requires**: `AMBIENT_API_URL` and `AMBIENT_BOT_TOKEN` secrets configured

## 2. Inert: standalone GHA (workflow_dispatch, manual only)

**File**: `.github/workflows/compile-wiki.yml`

Complete standalone implementation — no ACP dependency. Manual trigger only via `workflow_dispatch`. For demos, testing, or repos without ACP access.

```yaml
name: Compile Wiki
on:
  workflow_dispatch:
    inputs:
      force:
        description: 'Force full recompilation (ignore cache)'
        required: false
        default: 'false'
        type: boolean

permissions:
  contents: write

jobs:
  compile:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Install wiki compiler
        run: npm install -g @llm-wiki-compiler/cli

      - name: Compile wiki
        run: |
          ARGS="--config .wiki-compiler.json"
          if [ "${{ inputs.force }}" = "true" ]; then
            ARGS="$ARGS --force"
          fi
          wiki-compile $ARGS
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}

      - name: Commit compiled wiki
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add docs/wiki/
          git diff --cached --quiet && echo "No changes to commit" && exit 0
          git commit -m "docs: recompile wiki

          Triggered by: ${{ github.actor }}
          Force: ${{ inputs.force }}"
          git push
```

**Trigger**: Manual only — `Actions` tab > `Compile Wiki` > `Run workflow`
**Requires**: `ANTHROPIC_API_KEY` secret configured
**Input**: Optional `force` flag to bypass incremental cache

## Label Auto-Creation

The CL system prompt instructions include `gh label create continuous-learning --force` to ensure the label exists before creating the first PR. The `--force` flag is idempotent — no error if label already exists.

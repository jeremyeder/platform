# Task: Implement Markdown Linting Workflow

## Context

The vTeam repository contains 50+ Markdown files including critical documentation (CLAUDE.md, README.md, docs/**, agents/**) but has no automated markdown linting. CLAUDE.md explicitly requires running markdownlint on markdown files (line 237).

## Objectives

Create a GitHub Actions workflow that enforces consistent markdown formatting and style across all documentation.

## Requirements

### 1. Workflow Configuration

Create `.github/workflows/markdown-lint.yml` with:

- **Triggers:**
  - Push to `main` branch
  - Pull requests to `main` branch
  - Manual workflow dispatch

- **Change Detection:**
  - Only run when Markdown files are modified
  - Detect changes in: `**/*.md`

### 2. Linting Tool

Use **markdownlint-cli2** (modern, actively maintained):

- Tool: `markdownlint-cli2`
- Action: `DavidAnson/markdownlint-cli2-action@v18` or later
- Scan all `**/*.md` files in repository

### 3. Markdown Rules Configuration

Create `.markdownlint.json` with sensible defaults for technical documentation:

```json
{
  "default": true,
  "MD013": {
    "line_length": 120,
    "code_blocks": false,
    "tables": false
  },
  "MD033": false,
  "MD041": false,
  "MD046": {
    "style": "fenced"
  },
  "MD024": {
    "siblings_only": true
  }
}
```

**Rule explanations:**
- `MD013`: Line length - 120 chars (not 80), ignore code blocks and tables
- `MD033`: Allow inline HTML (needed for badges, special formatting)
- `MD041`: Don't require H1 as first line (some docs have front matter)
- `MD046`: Use fenced code blocks (```) instead of indented
- `MD024`: Allow duplicate headings if not siblings (common in multi-section docs)

### 4. File Exclusions

Exclude generated or third-party files:

- `node_modules/**`
- `.github/**` (workflow files contain code blocks that may violate rules)
- `**/site/**` (generated MkDocs output)
- `CHANGELOG.md` (if auto-generated)

Add exclusions via `.markdownlintignore` file.

### 5. Output and Reporting

- Show file path and line number for each violation
- Include rule ID (e.g., MD013) in error message
- Provide link to rule documentation for fixing
- Fail workflow if any violations found
- Summary of total files checked and violations found

### 6. Auto-Fix Capability (Future)

Document how developers can auto-fix locally:

```bash
# Install markdownlint-cli2
npm install -g markdownlint-cli2

# Check all markdown files
markdownlint-cli2 "**/*.md"

# Auto-fix violations (where possible)
markdownlint-cli2-fix "**/*.md"
```

## Implementation Pattern

Follow the existing pattern from `.github/workflows/go-lint.yml`:

1. Change detection job (outputs boolean)
2. Lint job (conditional on changes)
3. Clear error reporting with actionable guidance

## Expected File Structure

```
.github/workflows/markdown-lint.yml    # New workflow
.markdownlint.json                     # New config file
.markdownlintignore                    # New ignore file (optional)
```

## Success Criteria

- [ ] Workflow runs on markdown file changes
- [ ] Skips when no markdown files are modified
- [ ] Uses markdownlint-cli2
- [ ] Configuration file defines sensible rules for technical docs
- [ ] Clear error messages with rule IDs
- [ ] Can be run manually via workflow_dispatch
- [ ] Documented local fix process
- [ ] Follows vTeam workflow conventions

## Common Markdown Issues to Catch

The workflow should catch:

- ❌ Inconsistent heading hierarchy (skipping levels)
- ❌ Missing blank lines around headings
- ❌ Trailing whitespace
- ❌ Multiple consecutive blank lines
- ❌ Inconsistent list markers (-, *, +)
- ❌ Unordered list indentation
- ❌ Missing language tags on code blocks
- ❌ Bare URLs (use `[text](url)` instead)

## References

- CLAUDE.md requirement: Line 237 "ALWAYS run markdownlint locally on any markdown files that you work with"
- Existing linting workflows: `.github/workflows/go-lint.yml`, `.github/workflows/frontend-lint.yml`
- Markdown files to lint:
  - Root: `README.md`, `CLAUDE.md`, `CONTRIBUTING.md`, etc.
  - `docs/**/*.md` (user guide, developer guide, labs)
  - `agents/**/*.md` (agent personas)
  - `components/**/README.md`

## Notes

- This aligns with CLAUDE.md requirements
- Improves documentation quality and consistency
- Makes docs easier to read and maintain
- Consider adding pre-commit hooks later for local enforcement
- Start strict, can relax rules later if needed

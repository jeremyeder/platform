# Task: Fix AI Bot Review Spam and Optimize Claude Reviews

## Context

Multiple AI bots are watching the vTeam repository and spamming PRs with large, redundant reviews. This creates noise, slows down development, and makes it hard to find actionable feedback.

**Current State:**
- Multiple bots active: Claude Code Review, GitHub AI Assessment, possibly Copilot
- Reviews are too verbose and not concise
- No auto-fix capability for critical issues
- Reviews often duplicate each other

**Desired State:**
- Only Claude performs code reviews
- Reviews are concise summaries with critical issues only
- Auto-fix enabled for safe, critical issues
- Clean, actionable feedback

## Objectives

1. Disable all AI bot reviews except Claude
2. Optimize Claude reviews to be concise and focused
3. Enable auto-fix for safe, critical issues
4. Configure Claude to only review meaningful changes
5. Reduce review noise and improve signal-to-noise ratio

## Part 1: Disable Non-Claude AI Bots

### Inventory of Current Bots

Based on `.github/workflows/`:

1. **Claude Code Review** (`claude-code-review.yml`) - KEEP, will optimize
2. **AI Assessment Comment Labeler** (`ai-assessment-comment-labeler.yml`) - DISABLE
3. **GitHub Copilot** - Check if installed as GitHub App
4. **CodeQL** - Keep (security scanning, not reviews)
5. **Other bots** - Check GitHub Apps settings

### Disable AI Assessment Comment Labeler

**Option 1: Delete the workflow**
```bash
git rm .github/workflows/ai-assessment-comment-labeler.yml
git commit -m "Remove AI assessment comment labeler (noise reduction)"
```

**Option 2: Disable via workflow file** (safer, reversible)
```yaml
# Add to top of ai-assessment-comment-labeler.yml
on:
  workflow_dispatch:  # Manual only
  # Commented out automatic triggers
  # issues:
  #   types: [labeled]
```

### Check and Disable GitHub Apps

```bash
# List installed GitHub Apps (requires web UI or gh app extension)
# Go to: https://github.com/ambient-code/platform/settings/installations

# Common apps to check:
# - GitHub Copilot (if installed)
# - Codex (if installed)
# - Sourcegraph bot
# - Renovate bot (keep for dependencies)
# - Dependabot (keep)
```

**Manual process:**
1. Go to repo Settings → Integrations & services → GitHub Apps
2. Identify AI review bots (Copilot, Codex, etc.)
3. Remove or configure to not post PR comments

### Document Disabled Bots

Create `.github/DISABLED_BOTS.md`:

```markdown
# Disabled Bots and Why

This repository previously had multiple AI bots performing code reviews.
They have been disabled to reduce noise and improve review quality.

## Disabled Bots
- **AI Assessment Comment Labeler**: Removed - redundant with Claude reviews
- **GitHub Copilot PR Reviews**: Disabled - too verbose, low signal
- **[Other Bot Name]**: [Reason for disabling]

## Active Bots
- **Claude Code Review**: Primary AI reviewer (optimized for conciseness)
- **Dependabot**: Dependency updates (not a reviewer)
- **CodeQL**: Security scanning (not a reviewer)

## Rationale
- Single source of AI review truth (Claude only)
- Concise, actionable feedback
- Reduced PR comment spam
- Faster review cycles

Last updated: [Date]
```

## Part 2: Optimize Claude Code Review

### Current Claude Review Issues

From `claude-code-review.yml`:
- Generic prompt (too broad)
- No length constraints (verbose reviews)
- No auto-fix capability
- Runs on ALL PRs (even trivial changes)

### Optimized Claude Review Configuration

Update `.github/workflows/claude-code-review.yml`:

**1. Add size filtering** - Skip trivial changes:

```yaml
jobs:
  claude-review:
    runs-on: ubuntu-latest
    if: |
      github.event.pull_request.additions + github.event.pull_request.deletions > 20 &&
      !contains(github.event.pull_request.labels.*.name, 'skip-ai-review')
```

**2. Optimize the prompt** - Focus on critical issues:

```yaml
prompt: |
  Review this pull request with extreme conciseness. Focus ONLY on:

  **Critical Issues** (blocking - must fix):
  - Security vulnerabilities (SQL injection, XSS, auth bypass, etc.)
  - Data loss or corruption risks
  - Breaking changes without migration path
  - Memory leaks or resource exhaustion
  - Race conditions or concurrency bugs

  **High Priority** (should fix):
  - Performance regressions (>20% slower)
  - Error handling gaps (unhandled exceptions)
  - Test coverage gaps for critical paths
  - Violations of CLAUDE.md requirements

  **Format your review as:**

  ## Summary
  [1-2 sentences: overall assessment]

  ## Critical Issues
  [List with file:line, brief description, and fix suggestion - or "None"]

  ## Recommendations
  [Top 3 most important improvements - or "None"]

  **Constraints:**
  - Maximum 500 words total
  - Use bullet points, not paragraphs
  - Link to specific lines: file.go:123
  - Skip style/formatting (linters handle this)
  - Skip documentation comments (unless critical)
  - No praise or pleasantries

  Reference CLAUDE.md for project conventions. Post your review using `gh pr comment`.
```

**3. Add auto-fix capability** - Safe fixes only:

```yaml
- name: Run Claude Code Review with Auto-Fix
  id: claude-review
  uses: anthropics/claude-code-action@v1
  with:
    claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
    github_token: ${{ secrets.GITHUB_TOKEN }}
    allowed_non_write_users: '*'

    # Enable auto-fix for safe issues
    claude_args: |
      --allowed-tools "Bash(gh:*),Edit,Write,Read,Glob,Grep"
      --max-fixes 5

    prompt: |
      [Previous optimized prompt...]

      **Auto-Fix Instructions:**
      If you find critical issues that are SAFE to auto-fix (no business logic changes), you may fix them directly.

      **Safe to auto-fix:**
      ✅ Syntax errors (missing semicolons, brackets)
      ✅ Import sorting (isort, goimports)
      ✅ Formatting (black, gofmt)
      ✅ Obvious typos in strings/comments
      ✅ Missing error checks (add basic error handling)
      ✅ Unused imports (remove them)

      **NEVER auto-fix:**
      ❌ Business logic changes
      ❌ Algorithm modifications
      ❌ API contract changes
      ❌ Security-sensitive code (require human review)
      ❌ Database schema changes
      ❌ Anything requiring testing

      If you auto-fix issues:
      1. Limit to 5 fixes maximum per review
      2. Comment on PR listing what you fixed
      3. Push fixes to the PR branch
      4. Request human review for complex issues
```

**4. Add conciseness enforcement** - Fail if review is too long:

```yaml
- name: Check Review Length
  if: steps.claude-review.outputs.comment_length > 2000
  run: |
    echo "::warning::Claude review exceeded 2000 characters. Optimize prompt."
    # Optional: Fail the workflow if too verbose
    # exit 1
```

**5. Skip on draft PRs and dependencies:**

```yaml
if: |
  !github.event.pull_request.draft &&
  !contains(github.event.pull_request.title, 'dependabot') &&
  !contains(github.event.pull_request.labels.*.name, 'skip-ai-review') &&
  github.event.pull_request.additions + github.event.pull_request.deletions > 20
```

### Complete Optimized Workflow

Create `.github/workflows/claude-code-review-optimized.yml`:

```yaml
name: Claude Code Review (Optimized)

on:
  pull_request_target:
    types: [opened, synchronize]

jobs:
  claude-review:
    runs-on: ubuntu-latest

    # Skip conditions
    if: |
      !github.event.pull_request.draft &&
      !contains(github.event.pull_request.title, 'dependabot') &&
      !contains(github.event.pull_request.labels.*.name, 'skip-ai-review') &&
      github.event.pull_request.additions + github.event.pull_request.deletions > 20

    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
      actions: read

    steps:
      - name: Checkout PR head (fork-compatible)
        uses: actions/checkout@v5
        with:
          repository: ${{ github.event.pull_request.head.repo.full_name }}
          ref: ${{ github.event.pull_request.head.ref }}
          fetch-depth: 0

      - name: Run Claude Code Review
        id: claude-review
        uses: anthropics/claude-code-action@v1
        with:
          claude_code_oauth_token: ${{ secrets.CLAUDE_CODE_OAUTH_TOKEN }}
          github_token: ${{ secrets.GITHUB_TOKEN }}
          allowed_non_write_users: '*'

          claude_args: '--allowed-tools "Bash(gh:*),Edit,Write,Read,Glob,Grep"'

          prompt: |
            Review this pull request with EXTREME CONCISENESS. Maximum 500 words total.

            **Focus ONLY on critical issues:**

            🔴 **Critical** (blocking):
            - Security vulnerabilities
            - Data loss/corruption risks
            - Breaking changes without migration
            - Memory leaks or resource exhaustion

            🟡 **High Priority** (should fix):
            - Performance regressions (>20%)
            - Missing error handling
            - Test coverage gaps for critical paths
            - CLAUDE.md requirement violations

            **Review Format:**

            ## Summary
            [1-2 sentences]

            ## Critical Issues
            - file.go:123 - [issue] → [fix]
            (or "None found")

            ## Recommendations
            - [Top 3 improvements only]
            (or "None")

            **Auto-Fix Instructions:**
            You MAY auto-fix these ONLY (max 5 fixes):
            ✅ Formatting (gofmt, black, prettier)
            ✅ Import sorting (isort, goimports)
            ✅ Unused imports
            ✅ Obvious typos in strings/comments
            ✅ Missing basic error checks

            NEVER auto-fix:
            ❌ Business logic
            ❌ API contracts
            ❌ Security code
            ❌ Database changes

            If you auto-fix, list changes in review comment.

            Post review using: `gh pr comment <number> --body "<review>"`

            Reference CLAUDE.md for project conventions. Be ruthlessly concise.

      - name: Verify Review Conciseness
        run: |
          echo "✅ Claude review completed"
          # Future: Add length validation here
```

## Part 3: Migration Plan

### Step 1: Test Optimized Review

1. Create test PR with known issues
2. Manually trigger optimized Claude review
3. Verify:
   - Review is < 500 words
   - Only critical issues highlighted
   - Auto-fixes work correctly
   - No false positives

### Step 2: Disable Old Workflows

```bash
# Rename old workflow (preserve for rollback)
git mv .github/workflows/claude-code-review.yml .github/workflows/claude-code-review.yml.backup
git mv .github/workflows/ai-assessment-comment-labeler.yml .github/workflows/ai-assessment-comment-labeler.yml.disabled

# Activate optimized workflow
git mv .github/workflows/claude-code-review-optimized.yml .github/workflows/claude-code-review.yml

git commit -m "Optimize AI reviews: Claude only, concise format, auto-fix enabled"
```

### Step 3: Add Skip Label

Create `skip-ai-review` label:

```bash
gh label create "skip-ai-review" \
  --description "Skip automated AI code review for this PR" \
  --color "d4c5f9"
```

Usage: Apply to PRs that don't need review (docs typos, dependency bumps, etc.)

### Step 4: Monitor and Tune

After 1 week:
- Review 10 PR comments from Claude
- Check average word count (target: < 300 words)
- Count auto-fixes (should be minimal, high quality)
- Survey developers: Is feedback useful?
- Adjust prompt if needed

## Part 4: Documentation

### Update CLAUDE.md

Add section on AI reviews:

```markdown
## AI Code Reviews

vTeam uses Claude Code Review for automated PR feedback.

**What Claude Reviews:**
- PRs with > 20 lines changed
- Security vulnerabilities
- CLAUDE.md compliance
- Performance issues
- Test coverage gaps

**What Claude Auto-Fixes:**
- Code formatting (gofmt, black, prettier)
- Import sorting
- Obvious typos
- Basic error handling

**Skipping Reviews:**
Add `skip-ai-review` label to PRs that don't need AI review:
- Documentation typos
- Dependency updates (Dependabot)
- Draft PRs (auto-skipped)

**Review Format:**
Claude provides concise reviews (< 500 words):
- Summary (1-2 sentences)
- Critical issues (blocking)
- Top 3 recommendations

Reviews focus on critical issues only. Style/formatting is handled by linters.
```

### Update CONTRIBUTING.md

```markdown
## AI Code Review

Your PR will be automatically reviewed by Claude if:
- Changes > 20 lines
- Not a draft PR
- Not a dependency update

**Responding to Claude Reviews:**
- Critical issues: Fix before merging
- Recommendations: Fix or explain why not needed
- Auto-fixes: Review and approve if correct

**Skipping Review:**
Add `skip-ai-review` label for:
- Trivial documentation changes
- Typo fixes
- Configuration tweaks
```

## Expected File Structure

```
.github/workflows/
  ├── claude-code-review.yml          # Updated: Optimized version
  ├── claude-code-review.yml.backup   # Renamed: Old version
  ├── ai-assessment-comment-labeler.yml.disabled  # Renamed: Disabled
.github/
  └── DISABLED_BOTS.md                # New: Documentation
CLAUDE.md                             # Updated: AI review section
CONTRIBUTING.md                       # Updated: AI review guidance
```

## Success Criteria

- [ ] Only Claude performs code reviews (other bots disabled)
- [ ] Claude reviews are < 500 words (avg < 300)
- [ ] Reviews focus on critical issues only
- [ ] Auto-fix works for safe issues (< 5 per PR)
- [ ] Skip label works correctly
- [ ] Draft PRs and dependencies auto-skipped
- [ ] Developer feedback is positive
- [ ] Review turnaround time < 5 minutes
- [ ] False positive rate < 10%

## Monitoring Metrics

Track these metrics weekly:

| Metric | Target | Actual |
|--------|--------|--------|
| Avg review word count | < 300 | ? |
| % PRs skipped | 30-40% | ? |
| % Auto-fixes accepted | > 90% | ? |
| Review time (median) | < 3 min | ? |
| Developer satisfaction | > 4/5 | ? |
| False positive rate | < 10% | ? |

## Rollback Plan

If optimized reviews cause issues:

```bash
# Restore old Claude review
git mv .github/workflows/claude-code-review.yml.backup .github/workflows/claude-code-review.yml

# Re-enable AI assessment (if needed)
git mv .github/workflows/ai-assessment-comment-labeler.yml.disabled .github/workflows/ai-assessment-comment-labeler.yml

git commit -m "Rollback: Restore original AI review configuration"
git push origin main
```

## Testing Checklist

Before deploying:

- [ ] Test on PR with critical security issue (should catch)
- [ ] Test on PR with only formatting issues (should auto-fix)
- [ ] Test on PR with < 20 lines (should skip)
- [ ] Test on draft PR (should skip)
- [ ] Test on Dependabot PR (should skip)
- [ ] Test with `skip-ai-review` label (should skip)
- [ ] Verify review length < 500 words
- [ ] Verify auto-fixes are correct
- [ ] Check review arrives in < 5 minutes

## References

- Claude Code Action: https://github.com/anthropics/claude-code-action
- Current workflow: `.github/workflows/claude-code-review.yml`
- AI assessment workflow: `.github/workflows/ai-assessment-comment-labeler.yml`
- CLAUDE.md standards for conciseness

## Notes

- Start conservative with auto-fix (limit to 5 per PR)
- Can expand auto-fix scope after confidence builds
- Monitor false positives closely in first 2 weeks
- Get developer feedback early and often
- Consider adding review quality feedback mechanism
- May need to tune prompt based on actual PRs

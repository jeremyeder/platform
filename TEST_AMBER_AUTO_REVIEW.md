# Test: Amber Auto-Review Workflow

This file tests the new amber-auto-review.yml workflow that:

1. Automatically triggers on PR open/synchronize
2. Loads 7 memory system files (CLAUDE.md + 6 context/pattern files)
3. Posts a code review using repository-specific standards
4. Includes transparency link showing which files were loaded

## Expected Behavior

When this PR is created, the workflow should:

- ✅ Trigger automatically (pull_request_target)
- ✅ Minimize any old review comments
- ✅ Load all 7 memory files via Claude's Read tool
- ✅ Post a review comment with format:
  - Summary
  - Issues by Severity (Blocker/Critical/Major/Minor)
  - Positive Highlights
  - Recommendations
  - Transparency section (collapsible) listing loaded files
  - Link to workflow run logs (90-day retention)

## Verification Steps

1. Check that workflow triggered: https://github.com/ambient-code/platform/actions
2. Verify review comment appears on this PR
3. Expand transparency section to confirm all 7 files were loaded
4. Click workflow link to see Claude's decision process

## Memory System Files (Should Be Loaded)

1. CLAUDE.md - Master project instructions
2. .claude/context/backend-development.md
3. .claude/context/frontend-development.md
4. .claude/context/security-standards.md
5. .claude/patterns/k8s-client-usage.md
6. .claude/patterns/error-handling.md
7. .claude/patterns/react-query-usage.md

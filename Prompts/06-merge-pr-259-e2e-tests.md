# Task: Review and Merge PR #259 - E2E "Hero Journey" Tests

## Context

PR #259 by Gage Krumbach (@Gkrumbach07) adds end-to-end tests that represent the "hero journey" - the critical user path through the vTeam platform. This is the "dead man's switch" - if these tests fail, no more merges should be allowed to main.

**PR Details:**
- **Title:** Add tests
- **Author:** Gage Krumbach (@Gkrumbach07)
- **URL:** https://github.com/ambient-code/platform/pull/259
- **Branch:** `add-tests`
- **Status:** Open (not draft)

## Objectives

1. Review PR #259 for quality and completeness
2. Ensure tests cover the critical "hero journey" user path
3. Verify tests run successfully in CI
4. Merge PR #259 to main branch
5. Document what the tests cover for future reference

## Pre-Merge Review Checklist

### 1. Test Coverage Review

**Required Coverage (Hero Journey):**
- [ ] User authentication/authorization flow
- [ ] Project creation
- [ ] AgenticSession creation and execution
- [ ] Session monitoring and status updates
- [ ] Results retrieval
- [ ] Error handling for critical failures

**Questions to Answer:**
- What specific user journey do these tests validate?
- Are there any critical paths NOT covered?
- Do the tests run against a real or mocked backend?
- How long do the tests take to run?

### 2. Code Quality Review

**Check for:**
- [ ] Clear test names that describe what's being tested
- [ ] Proper setup and teardown (cleanup after tests)
- [ ] No hardcoded credentials or secrets
- [ ] Environment variable usage for configuration
- [ ] Appropriate test isolation (tests don't depend on each other)
- [ ] Good error messages when tests fail

### 3. CI Integration Review

**Verify:**
- [ ] Tests run in GitHub Actions (check `.github/workflows/`)
- [ ] Tests run on PR and push to main
- [ ] Test results are clearly reported
- [ ] Test failures block merge (or will after branch protection)
- [ ] Tests run on appropriate events (PR, push, schedule)

### 4. Documentation Review

**Check for:**
- [ ] README or docs explaining what tests do
- [ ] How to run tests locally
- [ ] Test environment setup instructions
- [ ] Expected test duration
- [ ] Known limitations or flaky tests

## Review Process

### Step 1: Fetch and Review PR Code

```bash
# Fetch PR branch
gh pr checkout 259

# Review changed files
gh pr diff 259

# Review commits
gh pr view 259 --json commits --jq '.commits[].commit.message'
```

### Step 2: Examine Test Files

```bash
# Find test files added
gh pr view 259 --json files --jq '.files[].path' | grep -E '\.(test|spec)\.'

# Review test structure
# (Use Read tool to examine specific test files)
```

### Step 3: Verify CI Status

```bash
# Check CI status
gh pr checks 259

# View test results
gh run view $(gh pr view 259 --json statusCheckRollup --jq '.statusCheckRollup[] | select(.name == "End-to-End Tests") | .workflowRun.databaseId')
```

### Step 4: Run Tests Locally (if possible)

```bash
# Follow instructions in PR description or test README
# Typical commands might be:
cd components/frontend && npm test
# or
go test ./...
# or
pytest tests/e2e/
```

### Step 5: Review with AI Assistance

- Use Claude Code Review workflow output (if available)
- Check for security issues flagged by bots
- Verify no sensitive data exposure

## Merge Decision Criteria

**Merge if ALL true:**
- [ ] Tests cover critical user journey
- [ ] All CI checks pass (green)
- [ ] No security issues identified
- [ ] Code quality is acceptable
- [ ] Documentation is sufficient
- [ ] Tests are not flaky (run multiple times successfully)
- [ ] Author has addressed any review comments

**Do NOT merge if:**
- ❌ Tests are failing
- ❌ Tests contain secrets or hardcoded credentials
- ❌ Tests are incomplete or don't cover the hero journey
- ❌ Flaky tests that pass/fail randomly
- ❌ No documentation on what's being tested
- ❌ Merge conflicts with main

## Merge Process

### Step 1: Final Pre-Merge Checks

```bash
# Ensure branch is up to date with main
gh pr view 259 --json mergeable,mergeStateStatus

# If mergeable is false, sync with main:
git checkout add-tests
git pull origin main
git push
```

### Step 2: Squash and Merge

```bash
# Merge PR with squash (per CLAUDE.md requirement)
gh pr merge 259 --squash --auto

# Alternative: Merge with custom message
gh pr merge 259 --squash --subject "Add E2E hero journey tests" --body "Implements critical end-to-end tests for user journey validation. This becomes the dead man's switch for main branch merges."
```

### Step 3: Verify Merge

```bash
# Check that PR is merged
gh pr view 259 --json state,merged,mergedAt

# Pull latest main
git checkout main
git pull origin main

# Verify tests run on main
gh run list --branch main --workflow "End-to-End Tests" --limit 1
```

## Post-Merge Actions

### 1. Document Test Coverage

Create or update `docs/testing/e2e-tests.md`:
- What the hero journey tests cover
- How to run them locally
- Expected runtime
- Maintenance guidelines

### 2. Update CLAUDE.md

Add reference to E2E tests as critical CI requirement:
```markdown
## Critical CI Checks
- E2E Hero Journey Tests - Must pass before merge
- (See docs/testing/e2e-tests.md for details)
```

### 3. Update Branch Protection

Add E2E tests to required status checks (see task #8).

### 4. Monitor Initial Runs

- Watch first few runs on main
- Check for flakiness
- Verify test duration is acceptable
- Document any issues found

## Rollback Plan

If tests cause problems after merge:

```bash
# Option 1: Revert the merge commit
git checkout main
git pull origin main
git revert -m 1 <merge-commit-sha>
git push origin main

# Option 2: Create fix PR
# (Preferred if issue is minor)
git checkout -b fix-e2e-tests
# Make fixes
git push origin fix-e2e-tests
gh pr create --title "Fix E2E test issues" --body "..."
```

## Success Criteria

- [ ] PR #259 is successfully merged to main
- [ ] E2E tests run on main branch
- [ ] All tests pass
- [ ] Tests are documented
- [ ] Tests are added to required CI checks
- [ ] Team understands what the tests validate
- [ ] Rollback plan is documented

## Communication

**After merge, announce:**
- Notify team that E2E tests are now active
- Share documentation on running tests locally
- Explain the "dead man's switch" concept
- Set expectations for test failures blocking merges

**Slack message template:**
```
🚀 E2E Hero Journey Tests Merged! 🚀

PR #259 is now merged to main, adding critical end-to-end tests.

📋 What this means:
• These tests validate the complete user journey through vTeam
• Test failures will block merges to main (dead man's switch)
• Tests run on every PR and push to main

📖 Docs: docs/testing/e2e-tests.md
🏃 Run locally: [instructions]
⏱️ Runtime: ~X minutes

Questions? Ask in #vteam-dev
```

## References

- PR #259: https://github.com/ambient-code/platform/pull/259
- CLAUDE.md git requirements: Always squash commits
- Branch protection setup: `enable-branch-protection-prompt.md`
- Existing test workflows: `.github/workflows/test-*.yml`

## Notes

- This is a HIGH PRIORITY merge - critical for main branch stability
- Gage Krumbach is the test infrastructure expert - defer to his judgment
- These tests become the foundation for preventing broken deployments
- After this merges, no PR should merge if E2E tests fail
- Consider this the "quality gate" for the vTeam platform

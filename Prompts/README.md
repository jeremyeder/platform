# vTeam Repository Hygiene Prompts

This directory contains optimized prompts for implementing repository hygiene improvements for the vTeam platform. Each prompt is a self-contained, actionable task that can be executed independently.

## Quick Reference

| # | Task | Priority | Estimated Time | Dependencies |
|---|------|----------|----------------|--------------|
| 01 | [Python Linting Workflow](#01-python-linting-workflow) | 🔴 Critical | 30 min | None |
| 02 | [Markdown Linting Workflow](#02-markdown-linting-workflow) | 🔴 Critical | 30 min | None |
| 03 | [Security Scanning (Trivy + CodeQL)](#03-security-scanning) | 🔴 Critical | 45 min | None |
| 04 | [Stale Management](#04-stale-management) | 🟡 High | 20 min | None |
| 06 | [Merge PR #259 (E2E Tests)](#06-merge-pr-259) | 🔴 Critical | 45 min | None |
| 08 | [E2E Tests Blocking + Slack](#08-e2e-tests-blocking) | 🔴 Critical | 30 min | #06 |
| 09 | [Fix AI Bot Review Spam](#09-fix-ai-bot-spam) | 🟡 High | 45 min | None |

**Note:** Task #05 (PR Labeling) was excluded per user request. Task #07 (Branch Protection) already exists as `enable-branch-protection-prompt.md` in the repository root.

## Prompt Descriptions

### 01. Python Linting Workflow
**File:** `01-python-linting-workflow.md`

**What it does:**
Creates a GitHub Actions workflow to enforce Python code quality standards (black, isort, flake8) for the claude-code-runner and runner-shell components.

**Why it's needed:**
Critical gap - Python components have no automated linting despite CLAUDE.md requirements.

**Key features:**
- Change detection (only runs when Python files modified)
- Parallel component linting (matrix strategy)
- Uses `uv` for fast dependency installation
- Follows existing go-lint.yml pattern

**Success criteria:**
- Workflow runs on Python file changes
- All three linters (black, isort, flake8) pass
- Clear error messages with fix instructions

---

### 02. Markdown Linting Workflow
**File:** `02-markdown-linting-workflow.md`

**What it does:**
Creates a GitHub Actions workflow to enforce consistent markdown formatting across 50+ documentation files using markdownlint-cli2.

**Why it's needed:**
CLAUDE.md explicitly requires markdownlint (line 237), but no automation exists.

**Key features:**
- Lints all `**/*.md` files
- Sensible rules for technical documentation
- `.markdownlint.json` configuration
- Auto-fix instructions for local development

**Success criteria:**
- Workflow runs on markdown changes
- Catches common formatting issues
- Results in consistent, readable documentation

---

### 03. Security Scanning (Trivy + CodeQL)
**File:** `03-security-scanning-workflows.md`

**What it does:**
Implements comprehensive security scanning using Trivy (container vulnerabilities) and CodeQL (static code analysis) for Go, TypeScript, and Python.

**Why it's needed:**
Production system with ZERO security scanning - critical gap for enterprise deployment.

**Key features:**
- **Trivy:** Scans all 4 container images + filesystem dependencies
- **CodeQL:** Analyzes Go, TypeScript, Python source code
- Results upload to GitHub Security tab
- Daily scheduled scans
- Blocks merges on CRITICAL vulnerabilities

**Success criteria:**
- All container images scanned
- Source code analyzed for security issues
- Results visible in GitHub Security tab
- Critical vulnerabilities block deployment

---

### 04. Stale Management
**File:** `04-stale-management-workflow.md`

**What it does:**
Automates cleanup of inactive PRs (60 days → stale, 90 days → close) and issues (90 days → stale, 120 days → close).

**Why it's needed:**
Reduces clutter, signals active maintenance, encourages contributors to finish work.

**Key features:**
- Different timelines for PRs vs issues
- Exemptions for security, roadmap, assigned items
- Friendly messages to contributors
- Auto-removal of stale label on activity

**Success criteria:**
- Daily automatic cleanup
- Important items exempt
- Clear contributor communication
- Reduced maintenance burden

---

### 06. Merge PR #259 (E2E Hero Journey Tests)
**File:** `06-merge-pr-259-e2e-tests.md`

**What it does:**
Provides a comprehensive review and merge checklist for PR #259 by Gage Krumbach, which adds critical end-to-end tests for the user journey.

**Why it's needed:**
These tests become the "dead man's switch" - if they fail, no merges allowed. Critical for main branch stability.

**Key features:**
- Pre-merge review checklist (coverage, quality, CI)
- Test execution verification
- Squash merge process (per CLAUDE.md)
- Post-merge documentation and monitoring

**Success criteria:**
- PR #259 merged successfully
- E2E tests running on main
- Tests documented for team
- Foundation for blocking merge policy

---

### 08. E2E Tests Blocking + Slack Alerts
**File:** `08-e2e-tests-blocking-slack-alerts.md`

**What it does:**
Makes E2E tests a required status check (blocks merges) and configures Slack alerts for failures on main branch.

**Why it's needed:**
Implements the "dead man's switch" - critical test failures must block all progress until fixed.

**Key features:**
- E2E tests added to branch protection
- Slack webhook workflow (ready to activate)
- Complete Slack bot setup documentation
- Alternative GitHub issue alerts
- Team escalation process

**Dependencies:**
- Requires PR #259 merged first

**Success criteria:**
- E2E failures block merges
- Slack alerts fire within 1 minute
- Team knows escalation process
- Response time < 15 minutes

---

### 09. Fix AI Bot Review Spam
**File:** `09-fix-ai-bot-review-spam.md`

**What it does:**
Disables all AI review bots except Claude, optimizes Claude reviews to be concise (< 500 words), and enables auto-fix for safe critical issues.

**Why it's needed:**
Multiple bots spam PRs with verbose, redundant reviews. Need single source of truth with high signal-to-noise ratio.

**Key features:**
- Disable AI Assessment Comment Labeler
- Optimize Claude prompt for conciseness
- Auto-fix safe issues (formatting, imports, typos)
- Skip trivial PRs (< 20 lines, drafts, dependencies)
- Maximum 500 words per review

**Success criteria:**
- Only Claude reviews active
- Reviews < 500 words (avg < 300)
- Focus on critical issues only
- Auto-fixes are safe and correct
- Developer satisfaction > 4/5

---

## Implementation Order

### Phase 1: Critical Infrastructure (Week 1)
1. **#01 Python Linting** - Close critical gap
2. **#02 Markdown Linting** - Align with CLAUDE.md
3. **#03 Security Scanning** - Production requirement
4. **#06 Merge PR #259** - Enable E2E tests

### Phase 2: Quality Gates (Week 2)
5. **#08 E2E Tests Blocking** - Implement dead man's switch
6. **#09 Fix AI Reviews** - Reduce noise, improve signal

### Phase 3: Maintenance (Week 3)
7. **#04 Stale Management** - Reduce maintenance burden
8. **Review and tune** - Adjust based on initial results

## Using These Prompts

Each prompt is designed to be:
- **Self-contained**: All context and requirements included
- **Actionable**: Step-by-step implementation instructions
- **Reversible**: Rollback plans for each change
- **Testable**: Success criteria and validation steps

### How to Execute

1. Read the prompt file completely
2. Review prerequisites and dependencies
3. Follow the implementation steps
4. Verify success criteria
5. Document any deviations or issues

### Customization

These prompts are templates. Adjust:
- Timelines (e.g., stale management days)
- Severity thresholds (e.g., security scanning)
- Review verbosity (e.g., Claude word count)
- Team-specific values (e.g., Slack channels)

## Existing Documentation

Related files in the repository:
- `enable-branch-protection-prompt.md` - Branch protection setup (root directory)
- `CLAUDE.md` - Project development standards
- `CONTRIBUTING.md` - Contributor guidelines
- `.github/workflows/*.yml` - Existing workflows

## Metrics and Success

After implementing all prompts, track:

| Metric | Baseline | Target | Actual |
|--------|----------|--------|--------|
| Python code quality | No checks | 100% pass | ? |
| Markdown consistency | No checks | 100% pass | ? |
| Security vulnerabilities | Unknown | 0 critical | ? |
| Stale PRs/issues | Unknown | < 10 total | ? |
| Main branch stability | Unknown | 99.9% green | ? |
| AI review noise | High | Low | ? |
| Developer satisfaction | Unknown | > 4/5 | ? |

## Feedback and Iteration

These prompts are living documents. Update based on:
- Implementation challenges
- Team feedback
- Tool updates
- New requirements

## Questions?

For questions about these prompts:
1. Check the prompt file's "References" section
2. Review related CLAUDE.md sections
3. Examine existing similar workflows
4. Ask in #vteam-dev Slack channel

---

**Last Updated:** 2025-11-06
**Author:** Jeremy Eder (Distinguished Engineer, Red Hat)
**Status:** Ready for implementation

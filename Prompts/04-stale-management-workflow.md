# Task: Implement Stale PR and Issue Management

## Context

The vTeam repository needs automated cleanup of inactive pull requests and issues to reduce clutter and maintenance burden. Stale management signals active maintenance and encourages contributors to complete work or communicate blockers.

## Objectives

Implement automated stale PR and issue management using GitHub Actions to:
- Mark inactive items as stale after a defined period
- Close items that remain inactive after warning
- Exempt important items (security, roadmap, blocked work)
- Reduce manual triage overhead

## Requirements

### 1. Workflow Configuration

Create `.github/workflows/stale-management.yml`:

- **Triggers:**
  - Schedule: Daily at 00:00 UTC
  - Manual workflow dispatch (for testing/immediate cleanup)

- **Permissions:**
  - `issues: write`
  - `pull-requests: write`

### 2. Stale Timelines

**Pull Requests:**
- Mark as stale after: **60 days** of inactivity
- Close after: **30 additional days** (90 days total)
- Rationale: PRs require active development; longer inactivity suggests abandonment

**Issues:**
- Mark as stale after: **90 days** of inactivity
- Close after: **30 additional days** (120 days total)
- Rationale: Issues can be valid long-term; more lenient timeline

### 3. Exemptions

**Never mark as stale:**

1. **By Label:**
   - PRs: `security`, `blocked`, `on-hold`, `waiting-for-upstream`, `roadmap`
   - Issues: `security`, `pinned`, `roadmap`, `good-first-issue`, `help-wanted`

2. **By Milestone:**
   - Any item assigned to a milestone (exempt: true)

3. **By Assignee:**
   - Any item assigned to someone (exempt: true)
   - Exception: Can override with `exempt-all-assignees: false` if needed

### 4. Stale Messages

**PR Stale Message:**
```markdown
This pull request has been inactive for 60 days and is now marked as stale.

If you're still working on this:
- Comment on this PR to remove the stale label
- Push new commits to show continued development
- Explain any blockers preventing completion

If no activity occurs within 30 days, this PR will be automatically closed. You can always reopen it later or create a new PR with updated changes.

Thank you for your contribution! 🙏
```

**PR Close Message:**
```markdown
This pull request has been closed due to 90 days of inactivity.

If you'd like to continue this work:
- Reopen this PR and push updates
- Create a new PR with fresh changes
- Comment if you need help completing this

The vTeam maintainers appreciate your contribution and welcome you to continue when you're ready!
```

**Issue Stale Message:**
```markdown
This issue has been inactive for 90 days and is now marked as stale.

If this is still relevant:
- Comment to describe the current status
- Update the issue with new information
- Add relevant labels or milestones

If no activity occurs within 30 days, this issue will be automatically closed. You can always reopen it later if needed.
```

**Issue Close Message:**
```markdown
This issue has been closed due to 120 days of inactivity.

If this is still relevant:
- Reopen this issue with updated context
- Create a new issue with current information
- Reference this issue in related discussions

Thank you for your contribution to vTeam!
```

### 5. Label Configuration

Create a `stale` label if it doesn't exist:
- Color: `#808080` (gray)
- Description: "This item has been inactive and may be closed soon"

### 6. Activity Detection

**What counts as activity (removes stale label):**
- New comments (from anyone)
- New commits (PRs only)
- Label changes (except adding/removing `stale`)
- Assignee changes
- Milestone changes

**What doesn't count:**
- Automated bot comments
- Stale bot actions

### 7. Operational Settings

```yaml
operations-per-run: 100  # Process up to 100 items per run
ascending: false         # Process newest first (more likely to be active)
remove-stale-when-updated: true  # Auto-remove stale label on activity
```

## Implementation

Use `actions/stale@v9` (latest stable):

**Key configuration:**
```yaml
- uses: actions/stale@v9
  with:
    # Stale timing
    days-before-stale: 60  # PRs
    days-before-close: 30
    days-before-issue-stale: 90  # Issues
    days-before-issue-close: 30

    # Labels
    stale-pr-label: 'stale'
    stale-issue-label: 'stale'

    # Exemptions
    exempt-pr-labels: 'security,blocked,on-hold,waiting-for-upstream,roadmap'
    exempt-issue-labels: 'security,pinned,roadmap,good-first-issue,help-wanted'
    exempt-milestones: true
    exempt-assignees: true

    # Messages (defined above)
    stale-pr-message: '...'
    close-pr-message: '...'
    stale-issue-message: '...'
    close-issue-message: '...'

    # Operations
    operations-per-run: 100
    remove-stale-when-updated: true
    ascending: false
```

## Expected File Structure

```
.github/workflows/
  └── stale-management.yml    # New workflow
```

## Success Criteria

- [ ] Workflow runs daily on schedule
- [ ] PRs marked stale after 60 days, closed after 90 days total
- [ ] Issues marked stale after 90 days, closed after 120 days total
- [ ] Exempt labels prevent stale marking
- [ ] Milestone and assignee exemptions work
- [ ] Stale label removed on activity
- [ ] Clear, friendly messages for contributors
- [ ] Manual dispatch works for testing
- [ ] Can process 100 items per run

## Testing Strategy

**Initial Testing:**
1. Run manually via workflow_dispatch
2. Use `dry-run: true` option first (if available)
3. Review stale candidates before enabling auto-close
4. Monitor first few runs for false positives

**Validation:**
- Check that important PRs/issues are exempt
- Verify messages are clear and helpful
- Confirm activity removes stale label
- Test reopen workflow

## Maintenance

**Periodic Review:**
- Monthly: Review closed items for false positives
- Quarterly: Adjust timelines if needed
- Yearly: Review exempt labels list

**Metrics to Track:**
- Number of items marked stale per month
- Number of items closed per month
- Number of items "unstaled" (activity after marking)
- False positive rate (items that shouldn't have been closed)

## Edge Cases to Handle

1. **Security issues:** Never close (exempt label)
2. **Blocked work:** Waiting on external factors (exempt label)
3. **Good first issues:** Keep open for new contributors (exempt label)
4. **Milestone work:** Part of planned release (exempt by milestone)
5. **Assigned work:** Someone is responsible (exempt by assignee)

## Communication

**Announce the new policy:**
- Update CONTRIBUTING.md with stale policy
- Add section explaining timelines and exemptions
- Post announcement when workflow is enabled
- Give 30-day grace period before first closures

## References

- actions/stale documentation: https://github.com/actions/stale
- Best practices: https://docs.github.com/en/communities/using-templates-to-encourage-useful-issues-and-pull-requests
- Similar workflows in large OSS projects: kubernetes/kubernetes, microsoft/vscode

## Notes

- Start with conservative timelines, can shorten later
- Friendly messages maintain community goodwill
- Closed items can always be reopened
- Reduces maintainer burden significantly
- Signals active project maintenance to community
- Consider shorter timelines for draft PRs (if distinguishable)
- Can add `stale-pr-ignore-updates: true` to ignore WIP commits

## Future Enhancements

- Different timelines for draft vs ready-for-review PRs
- Auto-ping assignees before closing
- Integration with project boards
- Custom logic for different types of issues (bug vs feature)

# Task: Make E2E Tests Blocking with Slack Alerting

## Context

After merging PR #259 (hero journey E2E tests), we need to:
1. Make E2E tests a **required check** that blocks merges when failing
2. Alert the team via Slack when E2E tests fail on main branch
3. Create preparatory artifacts for Slack integration (bot setup pending)

This implements the "dead man's switch" - if critical tests fail, stop all merges.

## Objectives

1. Add E2E tests to branch protection rules
2. Create Slack notification workflow (ready to activate when bot is configured)
3. Document Slack bot setup process for future execution
4. Ensure team is alerted immediately when critical tests fail

## Part 1: Make E2E Tests Blocking

### Update Branch Protection Rules

Add E2E tests to the required status checks list from `enable-branch-protection-prompt.md`.

**Current required checks:**
- `End-to-End Tests` ✅ (already listed)
- `lint-summary` (Go linting)
- `test-local-dev-simulation`

**Verification needed:**
- Confirm the exact job name from E2E workflow
- Check `.github/workflows/` for the E2E test workflow
- Verify the status check name that appears in GitHub PR UI

**Implementation:**

```bash
# First, verify the E2E test workflow job name
gh run list --workflow "End-to-End Tests" --limit 1 --json name,displayTitle,workflowName

# Update branch protection to include E2E tests
gh api -X PATCH repos/ambient-code/platform/branches/main/protection/required_status_checks \
  --field strict=true \
  -f contexts[]="End-to-End Tests" \
  -f contexts[]="lint-summary" \
  -f contexts[]="test-local-dev-simulation"

# Verify configuration
gh api repos/ambient-code/platform/branches/main/protection/required_status_checks | jq .
```

**Expected outcome:**
- PRs with failing E2E tests cannot be merged
- GitHub shows red X with "Required checks failed" message
- Only admin bypass can merge (emergency use only)

## Part 2: Slack Notification Workflow

### Create Workflow for Slack Alerts

Create `.github/workflows/e2e-failure-alert.yml`:

**Triggers:**
- E2E test workflow completion on `main` branch
- Only when E2E tests FAIL (not success)

**Workflow structure:**

```yaml
name: E2E Test Failure Alert

on:
  workflow_run:
    workflows: ["End-to-End Tests"]  # Must match exact workflow name
    types: [completed]
    branches: [main]

jobs:
  alert-on-failure:
    runs-on: ubuntu-latest
    if: ${{ github.event.workflow_run.conclusion == 'failure' }}
    steps:
      - name: Send Slack Alert
        uses: slackapi/slack-github-action@v2
        with:
          webhook-url: ${{ secrets.SLACK_E2E_ALERT_WEBHOOK }}
          payload: |
            {
              "text": "🚨 E2E Tests Failed on Main Branch! 🚨",
              "blocks": [
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*E2E Hero Journey Tests Failed on Main Branch*\n\n🔴 The dead man's switch has been triggered. No further merges should proceed until this is resolved."
                  }
                },
                {
                  "type": "section",
                  "fields": [
                    {
                      "type": "mrkdwn",
                      "text": "*Repository:*\n${{ github.repository }}"
                    },
                    {
                      "type": "mrkdwn",
                      "text": "*Branch:*\nmain"
                    },
                    {
                      "type": "mrkdwn",
                      "text": "*Commit:*\n<${{ github.event.workflow_run.html_url }}/commits/${{ github.event.workflow_run.head_sha }}|${{ github.event.workflow_run.head_sha }}>"
                    },
                    {
                      "type": "mrkdwn",
                      "text": "*Triggered by:*\n${{ github.event.workflow_run.actor.login }}"
                    }
                  ]
                },
                {
                  "type": "actions",
                  "elements": [
                    {
                      "type": "button",
                      "text": {
                        "type": "plain_text",
                        "text": "View Failed Run"
                      },
                      "url": "${{ github.event.workflow_run.html_url }}"
                    },
                    {
                      "type": "button",
                      "text": {
                        "type": "plain_text",
                        "text": "View Commit"
                      },
                      "url": "https://github.com/${{ github.repository }}/commit/${{ github.event.workflow_run.head_sha }}"
                    }
                  ]
                },
                {
                  "type": "context",
                  "elements": [
                    {
                      "type": "mrkdwn",
                      "text": "⚠️ *Action Required:* Investigate and fix immediately. Branch protection will block merges until tests pass."
                    }
                  ]
                }
              ]
            }
```

**Key features:**
- Triggers only on E2E test failures
- Only monitors `main` branch
- Rich Slack message with context
- Links to failed run and commit
- Clear call to action

### Alternative: GitHub Issues on Failure

If Slack integration is delayed, create issues instead:

```yaml
- name: Create Issue on E2E Failure
  uses: actions/github-script@v7
  with:
    script: |
      await github.rest.issues.create({
        owner: context.repo.owner,
        repo: context.repo.repo,
        title: `🚨 E2E Tests Failed on Main - ${context.sha.substring(0, 7)}`,
        body: `## E2E Test Failure Alert

        The hero journey E2E tests have failed on the main branch.

        **Commit:** ${context.sha}
        **Triggered by:** ${context.actor}
        **Workflow Run:** ${context.payload.workflow_run.html_url}

        ### Action Required
        1. Review the failed test run
        2. Identify the root cause
        3. Create a fix PR immediately
        4. No further merges until resolved

        **Dead Man's Switch Activated** - Branch protection will block merges until tests pass.
        `,
        labels: ['critical', 'e2e-failure', 'main-branch'],
        assignees: ['jeremyeder']  // Or team leads
      });
```

## Part 3: Slack Bot Setup Artifacts

Since Slack integration isn't set up yet, create reference materials for when you're ready.

### Create `.github/slack-bot-setup/README.md`:

**Contents:**

```markdown
# Slack Bot Setup for vTeam E2E Test Alerts

## Prerequisites

- Slack workspace admin access
- GitHub repository admin access
- Slack channel for alerts (recommended: #vteam-ci-alerts)

## Step 1: Create Slack App

1. Go to https://api.slack.com/apps
2. Click "Create New App" → "From scratch"
3. App name: `vTeam CI Alerts`
4. Workspace: Select your Red Hat workspace
5. Click "Create App"

## Step 2: Enable Incoming Webhooks

1. In app settings, go to "Incoming Webhooks"
2. Toggle "Activate Incoming Webhooks" to ON
3. Click "Add New Webhook to Workspace"
4. Select channel: `#vteam-ci-alerts` (or create channel first)
5. Click "Allow"
6. Copy the webhook URL (looks like: https://hooks.slack.com/services/T00000000/B00000000/XXXXXXXXXXXXXXXXXXXX)

## Step 3: Store Webhook as GitHub Secret

```bash
# Add webhook URL as GitHub secret
gh secret set SLACK_E2E_ALERT_WEBHOOK --body "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"

# Verify secret was created
gh secret list | grep SLACK
```

## Step 4: Test Notification

Trigger a test alert:

```bash
# Manually trigger the E2E failure alert workflow with test payload
gh workflow run e2e-failure-alert.yml
```

Or send a test webhook:

```bash
curl -X POST -H 'Content-type: application/json' \
  --data '{"text":"🧪 Test alert from vTeam CI"}' \
  YOUR_WEBHOOK_URL
```

## Step 5: Configure Channel

In `#vteam-ci-alerts`:

1. Set channel topic: "CI/CD alerts for vTeam platform - E2E test failures, deployment issues"
2. Pin message with escalation process
3. Add relevant team members
4. Configure notification preferences

### Recommended Mentions

Create a Slack user group for paging:

1. Workspace settings → User groups
2. Create group: `@vteam-oncall`
3. Add current on-call engineers
4. Update workflow to mention: `<!subteam^S12345678>` (use group ID)

## Step 6: Enable Workflow

Uncomment or activate the E2E failure alert workflow in `.github/workflows/e2e-failure-alert.yml`.

## Monitoring

Track alert effectiveness:
- Alert delivery time (should be < 1 minute)
- False positive rate (target: < 5%)
- Response time to alerts (target: < 15 minutes)

## Troubleshooting

### Alerts not sending
1. Check webhook URL is correct
2. Verify `SLACK_E2E_ALERT_WEBHOOK` secret exists
3. Check Slack app is still authorized
4. Review workflow logs in GitHub Actions

### Too many alerts
1. Review E2E test flakiness
2. Adjust workflow trigger conditions
3. Consider batching alerts (multiple failures → single alert)

### Wrong channel
1. Delete old webhook
2. Create new webhook pointing to correct channel
3. Update GitHub secret with new URL
```

### Create `.github/slack-bot-setup/message-templates.json`:

**Sample alert payloads for different scenarios:**

```json
{
  "e2e_failure": {
    "text": "🚨 E2E Tests Failed on Main Branch!",
    "blocks": [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "*E2E Hero Journey Tests Failed*\n🔴 Dead man's switch activated - investigate immediately"
        }
      }
    ]
  },
  "e2e_recovery": {
    "text": "✅ E2E Tests Recovered on Main Branch",
    "blocks": [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "*E2E Tests Now Passing*\n✅ Main branch is healthy again - merges can proceed"
        }
      }
    ]
  },
  "e2e_flaky": {
    "text": "⚠️ E2E Tests Flaky - Multiple Failures Detected",
    "blocks": [
      {
        "type": "section",
        "text": {
          "type": "mrkdwn",
          "text": "*E2E Tests Showing Flakiness*\n⚠️ 3 failures in last 10 runs - investigation recommended"
        }
      }
    ]
  }
}
```

## Part 4: Documentation

### Update CLAUDE.md

Add section on E2E test blocking:

```markdown
## E2E Test Blocking (Dead Man's Switch)

The vTeam platform enforces E2E hero journey tests as a blocking requirement for merges to main.

**Rules:**
- E2E tests MUST pass before merging to main
- Test failures trigger Slack alerts to #vteam-ci-alerts
- No exceptions except emergency admin bypass (document in PR)
- Fix failures immediately - they block all team progress

**If E2E tests fail:**
1. Alert appears in #vteam-ci-alerts within 1 minute
2. On-call engineer investigates immediately (< 15 min response)
3. Root cause identified and documented
4. Fix PR created and fast-tracked
5. Post-mortem for recurring failures

See `docs/testing/e2e-tests.md` for test details.
```

### Update CONTRIBUTING.md

Add E2E test information for contributors:

```markdown
## E2E Test Blocking

This repository uses E2E tests as a "dead man's switch" - if they fail on main, all merges are blocked.

**Before creating a PR:**
- Run E2E tests locally (see docs/testing/e2e-tests.md)
- Ensure your changes don't break the hero journey

**If your PR fails E2E tests:**
- Investigate locally first
- Check if main branch tests are also failing
- Fix your PR or report infrastructure issues
```

## Expected File Structure

```
.github/workflows/
  └── e2e-failure-alert.yml         # New: Slack alert workflow
.github/slack-bot-setup/
  ├── README.md                     # New: Setup instructions
  └── message-templates.json        # New: Alert templates
docs/testing/
  └── e2e-tests.md                  # Updated: Add blocking info
CLAUDE.md                           # Updated: Add E2E blocking section
CONTRIBUTING.md                     # Updated: Add E2E test info
```

## Success Criteria

- [ ] E2E tests added to branch protection (blocking)
- [ ] PRs with failing E2E tests cannot merge
- [ ] Slack alert workflow created (ready to activate)
- [ ] Slack bot setup documentation complete
- [ ] Team notified of new blocking requirement
- [ ] Escalation process documented
- [ ] Alternative alert mechanism (GitHub issues) working
- [ ] Response time targets defined

## Testing Plan

### Phase 1: Branch Protection
1. Enable E2E test blocking
2. Create test PR with intentionally failing E2E test
3. Verify merge is blocked
4. Fix test and verify merge allowed

### Phase 2: Alerts (When Slack Ready)
1. Set up Slack webhook
2. Trigger test failure on main (controlled)
3. Verify alert received in < 1 minute
4. Verify alert content is accurate
5. Test recovery notification

### Phase 3: Team Training
1. Document response procedures
2. Run tabletop exercise with team
3. Test on-call rotation
4. Verify everyone can access alerts

## Rollback Plan

If E2E blocking causes issues:

```bash
# Remove E2E from required checks temporarily
gh api -X PATCH repos/ambient-code/platform/branches/main/protection/required_status_checks \
  --field strict=true \
  -f contexts[]=lint-summary \
  -f contexts[]=test-local-dev-simulation
  # (E2E tests omitted)

# Disable Slack workflow
gh workflow disable e2e-failure-alert.yml
```

## References

- PR #259: E2E test implementation
- Branch protection setup: `enable-branch-protection-prompt.md`
- Slack GitHub Action: https://github.com/slackapi/slack-github-action
- GitHub workflow_run trigger: https://docs.github.com/en/actions/using-workflows/events-that-trigger-workflows#workflow_run

## Notes

- Slack integration is pending - prepare artifacts now, activate later
- Consider PagerDuty integration for true on-call alerting
- Monitor false positive rate - high rate indicates flaky tests
- E2E test failures on main are CRITICAL - treat as production outage
- Document every admin bypass of E2E checks

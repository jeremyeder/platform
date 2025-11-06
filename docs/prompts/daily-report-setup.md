# Daily Repository Report - Implementation Guide

## Objective
Generate and deliver automated daily reports for the Ambient Code Platform repository, summarizing commits, PRs, issues, and team activity.

## Report Structure

### Core Metrics
- Total commits in report period
- Pull request status (open/merged/closed)
- Critical issue count
- Active contributor count

### Report Sections

1. **Recent Activity Summary**
   - Commit count
   - PR statistics (merged, open, closed)
   - Open issues requiring attention
   - Active contributor count

2. **Key Commits**
   - Last 7-10 commits with hash, message, author, timestamp
   - Group by category: features, fixes, refactoring, dependencies

3. **Active Pull Requests**
   - Open PRs needing review (with age)
   - Recently merged PRs
   - Include PR number, title, author

4. **Critical Issues**
   - Bugs labeled as critical/high priority
   - New issues created in period
   - Include issue number, title, creation date

5. **Team Activity**
   - Top contributors by commit count
   - Areas of focus (analyze commit patterns)

6. **Recommended Actions**
   - PRs needing urgent review
   - Critical bugs requiring attention
   - Technical debt items to schedule

## Delivery Options

### Option 1: Slack (Recommended)

**Advantages:**
- Instant team visibility
- Rich formatting with Block Kit
- Threaded discussions
- Mobile notifications
- Searchable history in channel

**GitHub Actions Workflow:**
```yaml
name: Daily Report to Slack

on:
  schedule:
    - cron: '0 9 * * 1-5'  # 9 AM weekdays
  workflow_dispatch:

jobs:
  report:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: read
      pull-requests: read

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 50

      - name: Gather metrics
        id: metrics
        run: |
          COMMITS=$(git log --since="24 hours ago" --oneline --no-merges | wc -l)
          echo "commits=$COMMITS" >> $GITHUB_OUTPUT

          OPEN_PRS=$(gh pr list --state open --json number | jq '. | length')
          echo "open_prs=$OPEN_PRS" >> $GITHUB_OUTPUT

          CRITICAL=$(gh issue list --label bug --state open --json number | jq '. | length')
          echo "critical_issues=$CRITICAL" >> $GITHUB_OUTPUT
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Get recent commits
        id: commits
        run: |
          COMMITS=$(git log --since="24 hours ago" --pretty=format:"• %s (%an)" --no-merges | head -5)
          echo "COMMITS<<EOF" >> $GITHUB_OUTPUT
          echo "$COMMITS" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT

      - name: Get open PRs
        id: prs
        run: |
          PRS=$(gh pr list --state open --limit 5 --json number,title,author --jq '.[] | "• #\(.number): \(.title) (@\(.author.login))"')
          echo "PRS<<EOF" >> $GITHUB_OUTPUT
          echo "$PRS" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Get critical issues
        id: issues
        run: |
          ISSUES=$(gh issue list --label bug --state open --limit 5 --json number,title --jq '.[] | "• #\(.number): \(.title)"')
          echo "ISSUES<<EOF" >> $GITHUB_OUTPUT
          echo "$ISSUES" >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Send to Slack
        uses: slackapi/slack-github-action@v1.27.0
        with:
          webhook-url: ${{ secrets.SLACK_WEBHOOK_URL }}
          payload: |
            {
              "blocks": [
                {
                  "type": "header",
                  "text": {
                    "type": "plain_text",
                    "text": "📊 Daily Report - Ambient Code Platform"
                  }
                },
                {
                  "type": "section",
                  "fields": [
                    {
                      "type": "mrkdwn",
                      "text": "*📝 Commits (24h):*\n${{ steps.metrics.outputs.commits }}"
                    },
                    {
                      "type": "mrkdwn",
                      "text": "*🔥 Open PRs:*\n${{ steps.metrics.outputs.open_prs }}"
                    },
                    {
                      "type": "mrkdwn",
                      "text": "*🐛 Critical Issues:*\n${{ steps.metrics.outputs.critical_issues }}"
                    }
                  ]
                },
                {
                  "type": "divider"
                },
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Recent Commits:*\n${{ steps.commits.outputs.COMMITS }}"
                  }
                },
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Open Pull Requests:*\n${{ steps.prs.outputs.PRS }}"
                  }
                },
                {
                  "type": "section",
                  "text": {
                    "type": "mrkdwn",
                    "text": "*Critical Issues:*\n${{ steps.issues.outputs.ISSUES }}"
                  }
                },
                {
                  "type": "actions",
                  "elements": [
                    {
                      "type": "button",
                      "text": {
                        "type": "plain_text",
                        "text": "View Repository"
                      },
                      "url": "https://github.com/${{ github.repository }}"
                    }
                  ]
                }
              ]
            }
```

**Setup Steps:**
1. Create Slack Incoming Webhook:
   - Go to https://api.slack.com/apps
   - Create New App → From scratch
   - Enable Incoming Webhooks
   - Add to workspace and select channel
   - Copy webhook URL

2. Add GitHub Secret:
   - Repository Settings → Secrets and variables → Actions
   - New repository secret: `SLACK_WEBHOOK_URL`
   - Paste webhook URL

3. Create workflow file:
   - Save above YAML as `.github/workflows/daily-report-slack.yml`
   - Commit and push to main branch

4. Test:
   - Go to Actions tab → Daily Report to Slack → Run workflow

---

### Option 2: Email

**Advantages:**
- Personal delivery
- Works without Slack
- Good for executive summaries
- Email archive/search

**GitHub Actions Workflow:**
```yaml
name: Daily Repository Report

on:
  schedule:
    - cron: '0 9 * * 1-5'  # 9 AM weekdays
  workflow_dispatch:

jobs:
  generate-report:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: read
      pull-requests: read

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          fetch-depth: 50

      - name: Generate report
        id: report
        run: |
          cat > report.md << 'EOF'
          # Daily Report - Ambient Code Platform
          **Date:** $(date +"%B %d, %Y")

          ## Recent Commits (Last 24h)
          $(git log --since="24 hours ago" --pretty=format:"- %s (%an)" --no-merges | head -10)

          ## Open Pull Requests
          $(gh pr list --state open --json number,title,author --jq '.[] | "- #\(.number): \(.title) (@\(.author.login))"')

          ## Critical Issues
          $(gh issue list --label bug --state open --json number,title --jq '.[] | "- #\(.number): \(.title)"')
          EOF

          echo "REPORT<<EOF" >> $GITHUB_OUTPUT
          cat report.md >> $GITHUB_OUTPUT
          echo "EOF" >> $GITHUB_OUTPUT
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Send email report
        uses: dawidd6/action-send-mail@v3
        with:
          server_address: smtp.gmail.com
          server_port: 587
          username: ${{ secrets.EMAIL_USERNAME }}
          password: ${{ secrets.EMAIL_PASSWORD }}
          subject: "Daily Report - Ambient Code Platform"
          to: jeder@redhat.com
          from: GitHub Actions <noreply@github.com>
          body: ${{ steps.report.outputs.REPORT }}
          convert_markdown: true
```

**Setup Steps:**
1. Create Gmail App Password:
   - Go to Google Account settings
   - Security → 2-Step Verification
   - App passwords → Generate new
   - Copy password

2. Add GitHub Secrets:
   - `EMAIL_USERNAME` - Your Gmail address
   - `EMAIL_PASSWORD` - App-specific password

3. Create workflow file and test (same as Slack option)

---

## Sample Report Output

```markdown
# Daily Report - Ambient Code Platform
**Date:** November 6, 2025
**Report Period:** Last 7 days

### 🚀 Recent Activity Summary
- **15 commits** merged to main
- **10 pull requests** (6 merged, 2 open, 2 closed)
- **8 open issues** requiring attention
- **3 active contributors** this week

### 📝 Key Commits (Last 7 Days)
- de5e335 - Revert "Ambient breakdown sessions handler" (Sally O'Malley, 19h ago)
- 8fea265 - Fix #231: Add repository branch listing to UI (Sally O'Malley, 3d ago)
- 6c08e3f - Calculate actual agent count from session messages (Bob Gregor, 3d ago)
- 5d28015 - Update README - Ambient Code Platform naming (Bill Murdock, 3d ago)

### 🔥 Active Pull Requests
**Open (Need Review):**
- #259 - Add tests (Gage Krumbach)
- #255 - Update speckit (Michael Clifford)
- #251 - Add Gitlab support (Nati Fridman)

### 🐛 Critical Issues (Open)
- #258 - GitHubMintToken using backend SA not user-scoped (NEW TODAY)
- #237 - Backend sessions file too large & difficult to maintain
- #165 - Frontend build warnings

### 🎯 Recommended Actions
1. Review Priority: PR #259 (Add tests) needs review
2. Bug Alert: Issue #258 (token scoping) needs immediate attention
3. Technical Debt: Issue #237 (sessions.go refactoring) should be scheduled
```

---

## Customization Options

### Schedule Variations
```yaml
# Daily at 9 AM
cron: '0 9 * * *'

# Weekdays only at 9 AM
cron: '0 9 * * 1-5'

# Monday morning at 9 AM (weekly)
cron: '0 9 * * 1'

# Every 6 hours
cron: '0 */6 * * *'
```

### Query Customizations

**Filter by label:**
```bash
gh issue list --label "priority:high" --state open
```

**Filter by assignee:**
```bash
gh pr list --assignee "@me" --state open
```

**Filter by milestone:**
```bash
gh issue list --milestone "v2.0" --state open
```

**Custom time ranges:**
```bash
git log --since="7 days ago" --until="1 day ago"
```

---

## Advanced: AI-Enhanced Reports

For richer insights, integrate with Ambient Code Platform:

```yaml
- name: Generate AI-enhanced report
  run: |
    # Create AgenticSession for report generation
    curl -X POST http://vteam-backend:8080/api/projects/platform/agentic-sessions \
      -H "Authorization: Bearer ${{ secrets.ACP_TOKEN }}" \
      -H "Content-Type: application/json" \
      -d '{
        "name": "daily-report-'$(date +%Y%m%d)'",
        "prompt": "Analyze the last 24 hours of activity in this repository. Generate a comprehensive daily report including: 1) Summary of code changes with impact analysis, 2) PR review priorities based on complexity and age, 3) Issue triage recommendations, 4) Technical debt identification, 5) Team velocity trends. Format as markdown.",
        "repos": [{
          "input": {
            "url": "https://github.com/ambient-code/vteam",
            "branch": "main"
          }
        }],
        "timeout": 300
      }'
```

This provides:
- Deeper code analysis
- Pattern detection across commits
- Automated prioritization
- Trend identification
- Natural language summaries

---

## Quick Start Checklist

- [ ] Choose delivery method (Slack recommended)
- [ ] Create webhook/app password
- [ ] Add GitHub secrets
- [ ] Copy workflow YAML to `.github/workflows/`
- [ ] Customize schedule and queries
- [ ] Test with manual workflow dispatch
- [ ] Monitor first automated run
- [ ] Adjust content based on team feedback

---

## Maintenance

**Weekly:**
- Review report content for relevance
- Adjust queries based on team needs
- Check for workflow failures

**Monthly:**
- Update query filters as labels/milestones change
- Review schedule timing
- Gather team feedback on usefulness

**As Needed:**
- Add new metrics or sections
- Integrate with new tools (Jira, monitoring, etc.)
- Customize formatting for different audiences

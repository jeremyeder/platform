---
name: jira-log
description: >
  Log a new Jira issue to RHOAIENG with Team (Ambient team) and Component
  (Agentic) pre-filled. Structures descriptions for agent cold-start. Use when
  creating Jira tickets, logging bugs, filing stories, tracking tech debt, or
  creating work items. Triggers on: "create jira", "log issue", "file ticket",
  "new story", "log bug", "jira", "RHOAIENG".
---

# Jira Log

Create a new Jira Story in the RHOAIENG project with the correct Team and Component pre-filled for the Ambient team.

## User Input

```text
$ARGUMENTS
```

Consider the user input before proceeding (if not empty).

## Execution Steps

### 1. Parse User Input

Extract from `$ARGUMENTS`:
- **Summary** (required): The title/summary of the issue
- **Description** (optional): Detailed description
- **Issue Type** (optional): Defaults to `Story`. Can be `Bug` or `Task` (tech debt)
- **Priority** (optional): Defaults to `Normal`

If a simple sentence, use it as summary. Multiple lines: first line = summary, rest = description.

### 2. Gather Cold-Start Context

To make the Jira actionable by an agent, gather:

**Required for Stories:**
- What is the user-facing goal? (As a [user], I want [X], so that [Y])
- What are the acceptance criteria?
- Which repo/codebase?

**Required for Bugs:**
- Steps to reproduce
- Expected vs actual behavior
- Environment/browser info

**Helpful for all types:**
- Relevant file paths or components
- Related issues/PRs/design docs
- Constraints or out-of-scope items
- Testing requirements

### 3. Build Structured Description

```markdown
## Overview
[One paragraph summary]

## User Story (for Stories)
As a [type of user], I want [goal], so that [benefit].

## Acceptance Criteria
- [ ] [Criterion 1]
- [ ] [Criterion 2]

## Technical Context
**Repo**: [repo name or URL]
**Relevant Paths**:
- `path/to/relevant/file.ts`

## Related Links
- Design: [link if any]
- Related Issues: [RHOAIENG-XXXX]

## Constraints
- [What NOT to do]

## Testing Requirements
- [ ] Unit tests for [X]
- [ ] E2E test for [Y]
```

### 4. Confirm Details

Before creating:
```
About to create RHOAIENG Jira:

**Summary**: [extracted summary]
**Type**: Story
**Component**: Agentic
**Team**: Ambient team

Shall I create this issue? (yes/no/edit)
```

### 5. Create the Jira Issue

Use `mcp__jira__jira_create_issue` with:
```json
{
  "project_key": "RHOAIENG",
  "summary": "[summary]",
  "issue_type": "Story",
  "description": "[structured description]",
  "components": "Agentic",
  "additional_fields": "{\"labels\": [\"team:ambient\"]}"
}
```

Then set the Atlassian Team field (separate update):
```json
{
  "issue_key": "[KEY]",
  "fields": "{}",
  "additional_fields": "{\"customfield_10001\": \"ec74d716-af36-4b3c-950f-f79213d08f71-1917\"}"
}
```

Then add to active sprint:
```
mcp__jira__jira_get_sprints_from_board({ "board_id": "1115", "state": "active" })
mcp__jira__jira_add_issues_to_sprint({ "sprint_id": "[ID]", "issue_keys": "[KEY]" })
```

### 6. Report Success

```
Created: [ISSUE_KEY]
Link: https://redhat.atlassian.net/browse/[ISSUE_KEY]
Summary: [summary]
Component: Agentic
Team: Ambient team
Sprint: [sprint name]
```

## Field Reference

| Field | Value |
|-------|-------|
| Project | RHOAIENG |
| Component | Agentic |
| Team | Ambient team (`customfield_10001` = `ec74d716-af36-4b3c-950f-f79213d08f71-1917`) |
| Sprint Board | `1115` (scrum) / `1109` (kanban) |
| Label | `team:ambient` |
| Browse URL | `https://redhat.atlassian.net/browse/` |

## Agent Cold-Start Checklist

For a Jira to be immediately actionable by an agent:

| Element | Why It Matters |
|---------|----------------|
| **User Story** | Agent understands the "who" and "why" |
| **Acceptance Criteria** | Clear definition of done |
| **Repo + File Paths** | Agent knows where to look |
| **Constraints** | Prevents over-engineering |
| **Testing Requirements** | Agent knows expected coverage |

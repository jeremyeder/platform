# Lab 4: Hello RFE - The 7-Agent Council

## What You'll Learn

Submit a Request for Enhancement (RFE) and watch 7 specialized AI agents collaborate to refine it. Experience the engineering council pattern!

## Time Required

3 minutes (plus 2-3 minutes to read the results)

## Prerequisites

- Completed previous labs OR comfortable with ACP UI
- A test repository (same one from earlier labs works fine)
- Curiosity about how AI agents collaborate!

---

## Steps

### Step 1: Navigate to RFE Workflows

1. In your project, click **"RFE Workflows"** in the left navigation
2. Click **"+ New RFE"** (top right)

<!-- Screenshot placeholder: RFE Workflows navigation -->

**Success Check**: You should see an RFE creation form.

---

### Step 2: Enter Your Simple RFE

**Title**: Copy this title:

```text
Add a Hello Endpoint to the API
```

**Description**: Copy this description:

```text
We need to add a simple HTTP endpoint to our application that responds to GET requests.

Requirements:
- Endpoint path: /api/hello
- Method: GET
- Response: JSON with message "Hello from ACP!" and current timestamp
- Should work without authentication (public endpoint)

This is for testing and demonstration purposes.
```

**Repository**: Select your test repository (same as before)

---

### Step 3: Submit and Watch the Magic

1. Click **"Create RFE"**
2. You'll see the 7-agent council workflow start
3. Watch as each agent contributes their expertise:

**The 7-Agent Council:**

1. **Product Manager** - Validates business value and user needs
2. **Architect** - Designs technical approach and system integration
3. **Staff Engineer** - Reviews technical feasibility and best practices
4. **Product Owner** - Prioritizes and refines requirements
5. **Team Lead** - Plans implementation and resource allocation
6. **Team Member** - Provides implementation perspective
7. **Delivery Owner** - Ensures alignment with delivery goals

<!-- Screenshot placeholder: 7-agent council working -->

**This takes about 2-3 minutes** as each agent contributes.

---

### Step 4: Review Agent Contributions

Once completed, scroll through the results to see each agent's input:

**Product Manager** might say:
> "This endpoint provides a low-risk way to verify API health and demonstrate the platform. Valuable for onboarding and monitoring."

**Architect** might say:
> "Recommend implementing as a standard REST endpoint using the existing framework. Consider rate limiting even for public endpoints."

**Staff Engineer** might say:
> "Simple implementation, suggest using ISO 8601 for timestamp format. Include proper error handling and logging."

**Product Owner** might say:
> "Priority: Medium. Valuable for demos and health checks. Estimated effort: 1 story point."

**Team Lead** might say:
> "Can be completed in one sprint. Assign to junior developer as good first task. Includes writing tests."

**Team Member** might say:
> "Straightforward implementation. Will need to update API documentation and add integration test."

**Delivery Owner** might say:
> "No deployment concerns. Can release independently. Include in next minor version."

<!-- Screenshot placeholder: Individual agent contributions -->

---

### Step 5: Review the Refined RFE

At the bottom, you'll see the **Refined RFE Output** - a polished version incorporating all agent feedback:

- Clearer requirements
- Technical implementation details
- Risk assessment
- Effort estimation
- Acceptance criteria
- Testing requirements
- Documentation needs

**Success Check**: The refined RFE is much more detailed and actionable than your original!

---

## Success Criteria

✅ RFE workflow completed successfully

✅ All 7 agents provided input

✅ Each agent's contribution is visible in the UI

✅ Refined RFE includes implementation details, testing requirements, and acceptance criteria

✅ You can see how different perspectives improved the original idea

---

## What Just Happened?

You submitted a simple 3-sentence idea and the 7-agent council:

1. **Validated** the business case (PM, PO)
2. **Designed** the technical approach (Architect, Staff Engineer)
3. **Planned** the implementation (Team Lead, Team Member)
4. **Aligned** with delivery goals (Delivery Owner)

**Result**: A fully-specified, implementation-ready requirement!

**In traditional process, this would require:**

- Multiple meetings
- Email threads
- Document reviews
- Back-and-forth clarifications
- **Days or weeks of calendar time**

**With ACP**: Complete in 3 minutes, with input from 7 perspectives.

---

## Troubleshooting

**RFE stuck or taking too long?**

- The 7-agent workflow typically takes 2-3 minutes
- Check session logs for progress
- If stuck >5 minutes, try refreshing the page
- Check that Anthropic API key is configured in Project Settings

**Agents seem to repeat each other?**

- This can happen with very simple RFEs
- Try a more complex RFE for more varied responses
- Each agent still adds unique perspective based on their role

**Want different agent input?**

- Modify your RFE description to include specific concerns
- Ask questions in the RFE: "What about scalability?" or "Security concerns?"
- Agents will address what you mention

---

## Going Deeper

**Try More Complex RFEs:**

**Example: Feature with Trade-offs**

```text
Title: Add Real-Time Collaboration to Code Editor

Description:
Users want to collaborate on code in real-time, like Google Docs but for code.
Should we use WebSockets, Server-Sent Events, or a third-party service?
What are the scalability implications?
```

**Example: Cross-Cutting Concern**

```text
Title: Implement Audit Logging Across All Services

Description:
We need comprehensive audit logging for compliance.
Every user action should be logged with timestamp, user, action, and result.
How do we implement this consistently across 15 microservices?
```

**Example: Technical Debt**

```text
Title: Migrate from REST to GraphQL

Description:
Our frontend makes 20+ REST calls per page load.
Should we migrate to GraphQL? What's the ROI?
How do we handle the migration without breaking existing clients?
```

**Watch how different agents tackle complexity!**

---

## What You Learned

- **RFE Workflow**: How to submit and track Request for Enhancement
- **Agent Collaboration**: 7 specialized agents work together
- **Perspective Diversity**: Each role brings unique insights
- **Requirement Refinement**: Simple ideas become detailed specs
- **Efficiency**: What takes days happens in minutes

---

## Real-World Applications

Use RFE workflows for:

- **New Features**: Validate and design before coding
- **Architecture Changes**: Get multi-perspective analysis
- **Technical Debt**: Prioritize and plan refactoring
- **Incident Reviews**: Analyze failures with multiple lenses
- **Capacity Planning**: Assess resource needs from all angles
- **Security Reviews**: Get comprehensive threat analysis

---

## Understanding the Agent Roles

**Product-Focused Agents:**

- **PM**: User value, market fit, business case
- **PO**: Backlog priority, sprint planning, ROI

**Technical Agents:**

- **Architect**: System design, patterns, integration
- **Staff Engineer**: Best practices, code quality, feasibility

**Execution Agents:**

- **Team Lead**: Task breakdown, resource allocation, timeline
- **Team Member**: Implementation reality, effort estimation

**Delivery Agent:**

- **Delivery Owner**: Release planning, risk management, dependencies

**Together, they catch issues early and improve design quality.**

---

## Next Steps

**Continue Learning:**

- **[Lab 5: Hello Interactive →](05-interactive.md)** - Chat with AI in real-time
- **[User Guide](../../user-guide/index.md)** - Learn more about ACP features

**Advanced RFE Usage:**

- Create RFE templates for common scenarios
- Integrate RFE workflows with Jira
- Customize agent personas for your organization
- Chain RFE → Design → Implementation sessions

---

**Brilliant!** 🏆 You've seen how AI agents collaborate to refine ideas. Ready for real-time conversation?

[← Lab 3: Multi-Repo](03-multi-repo.md) | [Back to Index](index.md) | [Next Lab: Interactive →](05-interactive.md)

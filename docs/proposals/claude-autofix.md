# Claude Autofix Proposal

**Status**: Draft
**Created**: 2025-11-04
**Author**: Jeremy Eder
**Branch**: ideas

## Executive Summary

Integrate Claude Code's GitHub Actions capabilities into vTeam to provide automated code review, bug fixing, and quality improvements across Red Hat's engineering workflows. This proposal outlines how to leverage Claude's agent system to create an intelligent, context-aware autofix system that learns from project-specific patterns and standards.

## Problem Statement

Current challenges in Red Hat engineering workflows:

1. **Manual Code Review Overhead**: Reviewers spend significant time identifying common issues (formatting, type safety, security patterns)
2. **Inconsistent Standards**: Different teams apply coding standards inconsistently
3. **Delayed Feedback Loops**: Issues found late in CI/CD pipeline rather than at PR creation
4. **Context Loss**: Generic linters lack understanding of project-specific patterns and business logic
5. **Security Vulnerabilities**: Common security issues (injection, auth bypass) not caught early

## Proposed Solution

Deploy Claude Code as a GitHub Actions integration that:

- **Automatically reviews PRs** using specialized agents
- **Suggests and applies fixes** for common issues
- **Learns from project patterns** via CLAUDE.md and custom agents
- **Integrates with vTeam** to provide organizational knowledge sharing

### Core Architecture

```
PR Created → GitHub Actions Triggers → Claude Agents Analyze →
Agents Generate Fixes → Comment with Suggestions →
Optional: Auto-commit fixes to PR
```

## Agent Strategy

### 1. Built-in Agents (Immediate Use)

Leverage existing Claude Code agents:

- **code-reviewer**: General code quality, bugs, security
- **silent-failure-hunter**: Error handling analysis
- **code-simplifier**: Complexity reduction
- **type-design-analyzer**: Type safety improvements
- **pr-test-analyzer**: Test coverage validation
- **k8s-rbac-security-auditor**: Kubernetes security (critical for OpenShift)
- **sre-reliability-engineer**: Observability and reliability patterns

### 2. Red Hat Custom Agents (Phase 2)

Create organization-specific agents for:

- **openshift-best-practices**: OpenShift/Kubernetes patterns
- **golang-red-hat-standards**: Go coding standards for Red Hat
- **security-compliance**: FedRAMP, compliance requirements
- **api-design-reviewer**: REST API consistency
- **performance-analyzer**: Performance anti-patterns

### 3. Private Agent Repository Pattern

**Challenge**: Share agents across Red Hat repos without making them public.

**Solution**: Multi-repo checkout pattern in GitHub Actions:

```yaml
name: Claude Autofix
on:
  pull_request:
    types: [opened, synchronize]
  issue_comment:
    types: [created]

jobs:
  autofix:
    runs-on: ubuntu-latest
    steps:
      # Checkout main repository
      - uses: actions/checkout@v4
        with:
          path: repo
          fetch-depth: 0

      # Checkout private agents repository
      - uses: actions/checkout@v4
        with:
          repository: redhat-internal/claude-agents
          token: ${{ secrets.REDHAT_AGENTS_PAT }}
          path: agents-repo

      # Merge agent configurations
      - name: Setup Red Hat Agents
        run: |
          mkdir -p repo/.claude/agents
          cp -r agents-repo/.claude/agents/* repo/.claude/agents/

          # Optionally merge CLAUDE.md configs
          if [ -f agents-repo/CLAUDE.md ]; then
            cat agents-repo/CLAUDE.md >> repo/CLAUDE.md
          fi

      # Run Claude with combined agents
      - uses: anthropics/claude-code-action@v1
        with:
          working-directory: repo
          github_token: ${{ secrets.GITHUB_TOKEN }}
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          claude_args: |
            --prompt "Review this PR using Red Hat standards. Focus on security, OpenShift best practices, and code quality."
```

### 4. Agent Lifecycle Management

**Central Repository**: `redhat-internal/claude-agents`

```
claude-agents/
├── .claude/
│   ├── agents/
│   │   ├── openshift-best-practices.md
│   │   ├── golang-red-hat-standards.md
│   │   ├── security-compliance.md
│   │   ├── api-design-reviewer.md
│   │   └── performance-analyzer.md
│   └── CLAUDE.md  # Shared Red Hat standards
├── tests/
│   └── agent-tests/  # Validation for agent prompts
├── docs/
│   └── agent-guide.md
└── README.md
```

**Agent Development Workflow**:
1. Create agent in `claude-agents` repo
2. Test with sample codebases
3. PR review by engineering leads
4. Merge → automatically available to all repos using autofix

## Integration with vTeam

### Phase 1: Standalone GitHub Actions
- Deploy Claude autofix as GitHub Action
- Use in select Red Hat repositories
- Gather metrics on effectiveness

### Phase 2: vTeam Integration
- AgenticSession type: `GithubAutofix`
- Trigger vTeam sessions from GitHub webhooks
- Store autofix results in vTeam's ProjectSettings
- Learn from fix acceptance/rejection rates

### Phase 3: Organizational Learning
- Aggregate fix patterns across repos
- Identify common issues by team/project
- Feed insights back into agent improvements
- Generate organization-wide best practices

## Workflow Examples

### Example 1: Automatic Security Review

```yaml
# .github/workflows/claude-security-review.yml
name: Security Review
on:
  pull_request:
    paths:
      - '**/*.go'
      - '**/*.py'
      - '**/Dockerfile'
      - '**/k8s/**'

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          prompt: |
            Review this PR for security issues:
            - SQL/NoSQL injection vulnerabilities
            - Authentication/authorization bypasses
            - Secrets in code
            - Container security issues
            - Kubernetes RBAC misconfigurations

            Use: @secure-software-braintrust, @k8s-rbac-security-auditor
```

### Example 2: Auto-fix Common Issues

```yaml
# .github/workflows/claude-autofix.yml
name: Auto-fix
on:
  issue_comment:
    types: [created]

jobs:
  fix:
    if: contains(github.event.comment.body, '/autofix')
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          prompt: |
            Fix these common issues and commit to this PR:
            - Formatting (gofmt, black, prettier)
            - Import sorting
            - Missing error handling
            - Type safety issues
            - Unused variables

            Run linters and tests after fixes.
          commit_changes: true
```

### Example 3: OpenShift Best Practices

```yaml
# .github/workflows/claude-openshift-review.yml
name: OpenShift Review
on:
  pull_request:
    paths:
      - '**/manifests/**'
      - '**/*.yaml'
      - '**/Makefile'

jobs:
  openshift:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      # Load Red Hat agents
      - uses: actions/checkout@v4
        with:
          repository: redhat-internal/claude-agents
          token: ${{ secrets.REDHAT_AGENTS_PAT }}
          path: .claude-agents

      - run: cp -r .claude-agents/.claude .

      - uses: anthropics/claude-code-action@v1
        with:
          prompt: |
            Review Kubernetes/OpenShift manifests for:
            - Security contexts and pod security standards
            - Resource limits and requests
            - RBAC least privilege
            - Multi-tenancy isolation
            - OwnerReferences patterns
            - Operator best practices

            Use: @openshift-best-practices, @k8s-rbac-security-auditor
```

## Implementation Phases

### Phase 1: Pilot (Q1 2025)
**Goal**: Validate approach with 3-5 repositories

- [ ] Set up private `redhat-internal/claude-agents` repository
- [ ] Create initial 3 custom agents (OpenShift, Go standards, security)
- [ ] Deploy to vTeam, llm-d, and 2 other repos
- [ ] Collect metrics: PR review time, fix acceptance rate, false positives
- [ ] Iterate on agent prompts based on feedback

**Success Criteria**:
- 50% reduction in review time for common issues
- 80% acceptance rate for suggested fixes
- <10% false positive rate

### Phase 2: Expansion (Q2 2025)
**Goal**: Scale to 20-30 repositories across AI Engineering

- [ ] Create 5 additional agents (API design, performance, testing, docs)
- [ ] Integrate with vTeam backend (AgenticSession for GitHub events)
- [ ] Build analytics dashboard for fix patterns
- [ ] Implement agent versioning and rollback
- [ ] Create agent development guide for teams

**Success Criteria**:
- 30 repositories using autofix
- 10 custom agents deployed
- 70% of PRs receive automated feedback within 5 minutes

### Phase 3: Organization-Wide (Q3-Q4 2025)
**Goal**: Deploy across Red Hat Engineering (100+ repos)

- [ ] Integration with Red Hat's CI/CD standards
- [ ] Compliance and security certification
- [ ] Self-service agent creation for teams
- [ ] Organizational learning feedback loop
- [ ] Cost optimization and usage governance

**Success Criteria**:
- 100+ repositories using autofix
- 25+ custom agents
- Measurable impact on code quality metrics org-wide

## Cost Analysis

### GitHub Actions Minutes
- **Assumption**: 50 PRs/day across 30 repos, 5 min/review
- **Monthly consumption**: 7,500 minutes (~125 hours)
- **Cost**: Included in Red Hat's GitHub Enterprise plan

### Anthropic API Costs
- **Assumption**: 50 PRs/day, avg 100K tokens/review (input+output)
- **Model**: Claude Sonnet 4.5
  - Input: $3/MTok
  - Output: $15/MTok
- **Daily cost**: ~$150 (assuming 40K input, 10K output per review)
- **Monthly cost**: ~$4,500

**Cost Optimization**:
- Use `haiku` model for simple checks (formatting, linting)
- Use `sonnet` only for complex reviews (security, architecture)
- Implement caching for repeated patterns
- Target high-value PRs (>100 lines changed)

**ROI Calculation**:
- Engineer time saved: 2 hours/day/team × 20 teams = 40 hours/day
- Engineer cost: $100/hour (loaded cost)
- Daily savings: $4,000
- Monthly savings: $80,000
- **ROI**: 17x (after API costs)

## Security and Compliance

### Data Privacy
- Code stays on GitHub-hosted runners (never leaves GitHub/Anthropic)
- No persistent storage of code by Anthropic API
- Audit logs of all Claude interactions

### Access Control
- `ANTHROPIC_API_KEY` stored as GitHub organization secret
- `REDHAT_AGENTS_PAT` with minimal scopes (read-only to agents repo)
- Per-repo opt-in via workflow files

### Compliance
- Review Anthropic's SOC2, GDPR compliance
- Ensure compatibility with Red Hat's security policies
- Document data flows for compliance team

## Risks and Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|------------|
| False positives in suggestions | Medium | High | Iterative agent training, human-in-loop approval |
| API cost overruns | Medium | Medium | Per-repo budgets, usage monitoring, model selection |
| Agent prompt injection | High | Low | Input sanitization, restricted tool access |
| Dependency on external service | Medium | Low | Fallback to manual review, SLA monitoring |
| Inconsistent agent quality | Medium | Medium | Agent testing framework, peer review process |

## Success Metrics

### Quantitative
- **Review Time Reduction**: 30-50% decrease in time from PR open to LGTM
- **Fix Acceptance Rate**: >80% of suggested fixes accepted
- **False Positive Rate**: <10%
- **Code Quality Metrics**: Reduction in post-merge bugs, security issues
- **Coverage**: % of PRs receiving automated feedback

### Qualitative
- Developer satisfaction surveys
- Reviewer feedback on suggestion quality
- Team adoption rate
- Agent contribution from teams

## Alternatives Considered

### 1. Traditional Static Analysis Tools
**Pros**: Well-established, deterministic
**Cons**: Limited context awareness, high false positive rates, no fix suggestions

### 2. GitHub Copilot for Pull Requests
**Pros**: Native GitHub integration
**Cons**: Less customizable, no organization-specific agents, different focus

### 3. Build Our Own LLM Review System
**Pros**: Full control
**Cons**: High development/maintenance cost, need ML expertise, slower iteration

**Decision**: Claude Code provides best balance of customization, speed to value, and maintenance burden.

## Open Questions

1. **Agent Sharing**: Should we open-source some Red Hat agents for community benefit?
2. **Multi-repo Sessions**: Can a single Claude session review changes across multiple related repos?
3. **Learning Loop**: How do we automatically improve agents based on fix acceptance rates?
4. **Team Autonomy**: Should teams be able to override organization-wide agents?
5. **Integration with Jira**: Should autofix results flow into Jira for tracking?

## Next Steps

1. **Week 1-2**: Set up `redhat-internal/claude-agents` repository
2. **Week 3-4**: Create first 3 custom agents (OpenShift, Go, Security)
3. **Week 5-6**: Deploy to vTeam repo as pilot
4. **Week 7-8**: Gather feedback, iterate on agents
5. **Week 9-10**: Expand to 5 repos, document best practices
6. **Week 11-12**: Present results to engineering leadership for Phase 2 approval

## References

- [Claude Code GitHub Actions Documentation](https://docs.claude.com/en/docs/claude-code/github-actions)
- [Claude Code Subagents Guide](https://docs.claude.com/en/docs/claude-code/sub-agents)
- [vTeam Architecture](../ARCHITECTURE.md)
- [OpenShift OAuth Integration](../OPENSHIFT_OAUTH.md)

## Appendix A: Sample Agent Definitions

### OpenShift Best Practices Agent

```markdown
---
name: openshift-best-practices
description: Reviews Kubernetes/OpenShift manifests for Red Hat best practices
tools: Read, Grep, Glob
model: sonnet
---

You are an expert in Kubernetes and OpenShift best practices, specifically for Red Hat environments.

Review manifests for:

1. **Security Contexts**:
   - AllowPrivilegeEscalation: false
   - ReadOnlyRootFilesystem: true (when possible)
   - Capabilities: drop ALL, add only required
   - RunAsNonRoot: true

2. **Resource Management**:
   - All containers MUST have resource requests and limits
   - Memory limits should be 20-50% higher than requests
   - Use project quotas for namespace isolation

3. **RBAC**:
   - Follow least privilege principle
   - Use RoleBindings (not ClusterRoleBindings) when possible
   - ServiceAccounts should have minimal permissions
   - NEVER use BlockOwnerDeletion (permission issues)

4. **Multi-tenancy**:
   - OwnerReferences set on all child resources
   - Namespace isolation enforced
   - No cross-namespace resource access

5. **Operator Patterns**:
   - Status updates use UpdateStatus subresource
   - Reconciliation handles IsNotFound gracefully
   - Watch loops reconnect on channel close
   - No panic() in production code

Reference: vTeam CLAUDE.md "Backend and Operator Development Standards"
```

### Go Red Hat Standards Agent

```markdown
---
name: golang-red-hat-standards
description: Enforces Red Hat Go coding standards and patterns
tools: Read, Grep, Glob, Bash
model: sonnet
---

You are an expert Go developer familiar with Red Hat's coding standards.

Review Go code for:

1. **Error Handling**:
   - ALL errors must be handled (no ignored errors)
   - Return errors with context: `fmt.Errorf("failed to X: %w", err)`
   - Log errors before returning
   - NEVER use panic() in production code

2. **Authentication**:
   - ALWAYS use user-scoped K8s clients for API operations
   - Use `GetK8sClientsForRequest(c)` in handlers
   - Return 401 if user token invalid
   - Backend service account ONLY for CR writes and token minting

3. **Type Safety**:
   - Use `unstructured.Nested*` helpers with three-value returns
   - ALWAYS check `found` before using values
   - No direct type assertions without checking

4. **Resource Management**:
   - Set OwnerReferences on all child resources
   - Use UpdateStatus subresource for status updates
   - Handle IsNotFound gracefully during cleanup

5. **Security**:
   - NEVER log tokens or secrets
   - Redact sensitive data: `tokenLen=%d`
   - RBAC checks before resource access

6. **Code Quality**:
   - Run: gofmt, go vet, golangci-lint before commit
   - Table-driven tests with subtests
   - Structured logging with context

Reference: vTeam CLAUDE.md "Backend and Operator Development Standards"
```

## Appendix B: Cost Model Spreadsheet

| Scenario | Repos | PRs/Day | Min/Review | Tokens/Review | Model | Daily API Cost | Monthly API Cost | Monthly Savings |
|----------|-------|---------|------------|---------------|-------|----------------|------------------|-----------------|
| Pilot | 5 | 10 | 5 | 50K (40K in, 10K out) | Sonnet | $30 | $900 | $16,000 |
| Phase 2 | 30 | 50 | 5 | 100K (80K in, 20K out) | Sonnet | $150 | $4,500 | $80,000 |
| Optimized | 30 | 50 | 3 | 50K (40K in, 10K out) | Haiku + Sonnet | $75 | $2,250 | $80,000 |
| Phase 3 | 100 | 200 | 3 | 50K (40K in, 10K out) | Haiku + Sonnet | $300 | $9,000 | $320,000 |

**Notes**:
- Savings based on 2 hours engineer time saved per team per day
- Loaded engineer cost: $100/hour
- Optimization uses Haiku for simple checks, Sonnet for complex reviews

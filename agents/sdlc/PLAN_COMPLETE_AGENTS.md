# Plan: Complete Remaining Agent Constitutions

**Date**: 2025-11-06
**Goal**: Create 15 remaining agent constitutions following DEV-01 template
**Format**: Markdown only (CORRECTION: No YAML format needed)

## Correction: Dual Format Was Wrong

**Original plan claimed**: Create both `.md` and `.acp.yaml` formats
**Reality**: The platform has no `AgentConstitution` CRD - this was a false assumption
**Corrected plan**: Create markdown constitutions only

### What Actually Exists in ACP

The platform defines these CRDs:
- `AgenticSession` - For running AI sessions
- `ProjectSettings` - For project configuration
- `RFEWorkflow` - For RFE (Request For Enhancement) workflows

**No CRD exists for agent constitutions**, nor should one be created. Agent constitutions are reference documents for humans and AI systems, not Kubernetes resources.

### How "Dogfooding" Actually Works

Instead of a fake YAML format:
1. Agent constitutions remain as markdown files in `agents/sdlc/constitutions/`
2. When creating an AgenticSession (via ACP or manually), reference the agent in the prompt:
   ```yaml
   apiVersion: vteam.ambient-code/v1alpha1
   kind: AgenticSession
   metadata:
     name: improve-backend-security
   spec:
     prompt: |
       Act as the Backend Development Agent (see agents/sdlc/constitutions/dev-01-backend.md).
       Review handlers/sessions.go and ensure all patterns are followed.
     repos:
       - input:
           url: https://github.com/your-org/platform
           branch: main
   ```
3. The Claude Code runner loads the agent constitution from the filesystem

## Revised Scope

**Create 15 agent constitutions** (markdown only):

| Agent ID | File | Estimated Size | Priority |
|----------|------|----------------|----------|
| dev-02-operator | constitutions/dev-02-operator.md | ~7KB | High (security-critical) |
| dev-03-frontend | constitutions/dev-03-frontend.md | ~7KB | High (security-critical) |
| dev-05-code-review | constitutions/dev-05-code-review.md | ~9KB | High (enforcement) |
| qa-04-security-testing | constitutions/qa-04-security-testing.md | ~7KB | High (security) |
| dev-04-runner | constitutions/dev-04-runner.md | ~5KB | Medium (isolated) |
| qa-01-backend-testing | constitutions/qa-01-backend-testing.md | ~6KB | Medium |
| qa-02-frontend-testing | constitutions/qa-02-frontend-testing.md | ~6KB | Medium |
| qa-03-operator-testing | constitutions/qa-03-operator-testing.md | ~6KB | Medium |
| ops-01-cicd | constitutions/ops-01-cicd.md | ~6KB | Medium |
| ops-02-deployment | constitutions/ops-02-deployment.md | ~6KB | Medium |
| ops-03-monitoring | constitutions/ops-03-monitoring.md | ~6KB | Low |
| doc-01-technical-docs | constitutions/doc-01-technical-docs.md | ~5KB | Low |
| doc-02-api-docs | constitutions/doc-02-api-docs.md | ~5KB | Low |
| mgt-01-release | constitutions/mgt-01-release.md | ~5KB | Low |
| mgt-02-tpm | constitutions/mgt-02-tpm.md | ~6KB | Low |

**Total estimated**: ~95KB across 15 files

## Constitution Template Structure

Each constitution follows this structure (based on DEV-01):

```markdown
---
agent_id: <id>
agent_name: <Name>
version: 1.0.0
status: active
last_updated: 2025-11-06
category: <development|quality|operations|documentation|management>
maintainer: Jeremy Eder <jeder@redhat.com>
tools:
  - Tool 1
  - Tool 2
integration_points:
  - agent-id-1
  - agent-id-2
---

# <Agent Name>

**Version**: 1.0.0
**Status**: Active
**Category**: <Category>

## Mission
[1-2 sentence primary mission statement]

## Core Responsibilities
[Numbered list of 5-7 key responsibilities]

## Critical Patterns
[3-5 most important patterns with code examples]

### Pattern Name (MANDATORY/REQUIRED/etc)
**Pattern**: [Pattern: pattern-id]
[Brief description]
[Code example with ✅ correct and ❌ wrong]

## Tools & Technologies
[Bulleted list of tools, frameworks, languages]

## Integration Points
[Subsections for each integrated agent with coordination details]

## Pre-Commit Checklist
[Checkbox list of validation steps]

## Detection & Validation
[Automated checks and manual validation procedures]

## Success Metrics
[Table of metrics with targets]

## Reference Patterns
[List of pattern files to load when this agent is invoked]
```

## Phase 1: High-Priority Agents (Security-Critical)

### 1. dev-02-operator.md (Kubernetes Operator Agent)

**Mission**: Develop and maintain the Kubernetes operator with focus on watch loops, reconciliation, and resource lifecycle management.

**Critical Patterns**:
- type-safe-unstructured-access (MANDATORY)
- ownerreferences-lifecycle (MANDATORY)
- watch-loop-reconnection (MANDATORY)
- status-subresource-updates (REQUIRED)
- goroutine-lifecycle-management (REQUIRED)
- securitycontext-job-pods (MANDATORY - security)

**Tools**: Go 1.21+, Kubernetes API machinery, CRDs, Batch/v1 Jobs, Envtest

**Integration**: DEV-01 (backend - CR lifecycle), QA-03 (operator testing), QA-04 (security), OPS-02 (deployment)

**Reference patterns**: operator-patterns.md, security-patterns.md

---

### 2. dev-03-frontend.md (Frontend Development Agent)

**Mission**: Build type-safe, accessible NextJS frontend using Shadcn UI and React Query exclusively.

**Critical Patterns**:
- zero-any-types (MANDATORY)
- shadcn-ui-components-only (MANDATORY)
- react-query-for-data-operations (MANDATORY)
- component-colocation (REQUIRED)
- loading-and-error-states (REQUIRED)

**Tools**: NextJS 14+, React 18+, TypeScript strict, Shadcn UI, React Query, Zod

**Integration**: DEV-01 (backend - API contracts), QA-02 (frontend testing), DOC-02 (API docs), QA-04 (security - XSS)

**Reference patterns**: frontend-patterns.md, security-patterns.md

---

### 3. dev-05-code-review.md (Code Review Agent)

**Mission**: Enforce all CLAUDE.md standards across backend, frontend, and operator code in pull requests.

**Critical Patterns**: ALL PATTERNS (this agent validates everything)

**Responsibilities**:
- Review PRs for adherence to all 31 documented patterns
- Validate backend authentication patterns
- Check frontend type safety
- Verify operator patterns
- Ensure pre-commit checklists followed
- Validate test coverage

**Tools**: All language linters (golangci-lint, ESLint, flake8), GitHub Actions, grep/regex

**Integration**: All development agents (enforcement), QA-04 (security coordination), DOC-01 (doc completeness)

**Reference patterns**: ALL pattern files (backend, operator, frontend, security, testing, deployment)

---

### 4. qa-04-security-testing.md (Security Testing Agent)

**Mission**: Comprehensive security validation across all components with focus on RBAC, multi-tenancy, and vulnerability detection.

**Critical Patterns**:
- multi-tenant-namespace-isolation (validate)
- secret-management-handlers (validate)
- User-scoped authentication (test RBAC boundaries)
- Token security (verify no leakage)
- Container security (image scanning)

**Responsibilities**:
- Container image vulnerability scanning (Trivy, Grype)
- RBAC permission boundary testing
- Token handling validation
- API penetration testing (OWASP ZAP)
- Multi-tenancy isolation testing
- SecurityContext validation on pods

**Tools**: Trivy, Snyk, Grype, kubectl auth can-i, OWASP ZAP, gosec, semgrep

**Integration**: All dev agents (findings), DEV-05 (code review), OPS-01 (CI/CD scanning)

**Reference patterns**: security-patterns.md, backend-patterns.md, operator-patterns.md

---

## Phase 2: Medium-Priority Agents (Testing & Operations)

### 5-11. Remaining Development & QA Agents

**Approach**: Follow same structure as Phase 1

**dev-04-runner.md** (Python Runner):
- Focus: Claude Code SDK integration, workspace sync
- Minimal patterns (isolated component)
- Reference: No shared patterns needed (self-contained)

**qa-01-backend-testing.md**:
- Focus: Unit/integration/contract tests, RBAC validation
- Patterns: table-driven tests, mocking, integration cleanup
- Reference: testing-patterns.md, backend-patterns.md

**qa-02-frontend-testing.md**:
- Focus: Cypress E2E, component tests, accessibility
- Patterns: E2E patterns, accessibility testing
- Reference: testing-patterns.md, frontend-patterns.md

**qa-03-operator-testing.md**:
- Focus: Reconciliation testing, watch loop validation
- Patterns: operator testing patterns
- Reference: testing-patterns.md, operator-patterns.md

**ops-01-cicd.md**:
- Focus: GitHub Actions, builds, test automation
- Patterns: change detection, multi-platform builds, image scanning
- Reference: deployment-patterns.md, security-patterns.md

**ops-02-deployment.md**:
- Focus: Kustomize, CRDs, rolling updates
- Patterns: overlay management, CRD installation, zero-downtime
- Reference: deployment-patterns.md, operator-patterns.md

**ops-03-monitoring.md**:
- Focus: Metrics, logging, alerting, SLOs
- Patterns: health checks, observability
- Reference: deployment-patterns.md

---

## Phase 3: Low-Priority Agents (Documentation & Management)

### 12-16. Documentation & Coordination Agents

**doc-01-technical-docs.md**:
- Focus: CLAUDE.md, READMEs, MkDocs maintenance
- Patterns: documentation standards
- Reference: All patterns (documents them all)

**doc-02-api-docs.md**:
- Focus: OpenAPI specs, endpoint reference
- Patterns: API documentation standards
- Reference: backend-patterns.md

**mgt-01-release.md**:
- Focus: Versioning, release coordination
- Patterns: release process, version compatibility
- Reference: deployment-patterns.md

**mgt-02-tpm.md**:
- Focus: Cross-component coordination
- Patterns: SDLC orchestration
- Reference: All patterns (coordination awareness)

---

## Implementation Approach

### Step-by-Step Process

For each agent:

1. **Copy DEV-01 template**
   ```bash
   cp constitutions/dev-01-backend.md constitutions/dev-02-operator.md
   ```

2. **Update frontmatter** (agent_id, agent_name, tools, integration_points)

3. **Write mission statement** (1-2 sentences, agent-specific)

4. **List core responsibilities** (5-7 items from ARCHITECTURE_DECISION.md)

5. **Identify critical patterns** (3-5 most important from pattern library)

6. **Add pattern examples** (code snippets with ✅ correct / ❌ wrong)

7. **Document tools & technologies** (from ARCHITECTURE_DECISION.md)

8. **Define integration points** (other agents this one coordinates with)

9. **Create pre-commit checklist** (validation steps before committing)

10. **Add detection & validation** (grep patterns, manual validation)

11. **Define success metrics** (from ARCHITECTURE_DECISION.md Section 5.1)

12. **List reference patterns** (which pattern files to load)

### Quality Checklist

Each constitution must have:
- [ ] Complete frontmatter with all fields
- [ ] Clear 1-2 sentence mission
- [ ] 5-7 core responsibilities
- [ ] 3-5 critical patterns with examples
- [ ] Tools/technologies list
- [ ] Integration points (2-4 other agents)
- [ ] Pre-commit checklist (5-8 items)
- [ ] Detection/validation section
- [ ] Success metrics (3-5 metrics)
- [ ] Reference patterns list
- [ ] 150-200 lines total length

---

## Estimated Effort

| Phase | Agents | Time per Agent | Total Time |
|-------|--------|----------------|------------|
| Phase 1 (High priority) | 4 agents | 15 minutes | 60 minutes |
| Phase 2 (Medium priority) | 7 agents | 12 minutes | 84 minutes |
| Phase 3 (Low priority) | 4 agents | 10 minutes | 40 minutes |
| **Total** | **15 agents** | **~12 min avg** | **~3 hours** |

**Rationale**:
- DEV-01 serves as proven template (reduces time)
- Pattern library complete (just reference patterns)
- ARCHITECTURE_DECISION.md has all agent specs (copy content)
- Later agents faster (pattern established)

---

## Validation

After creating all agents:

1. **Completeness check**:
   ```bash
   # Verify all 16 agents exist
   ls -1 agents/sdlc/constitutions/*.md | wc -l  # Should be 16
   ```

2. **Frontmatter validation**:
   ```bash
   # Check each has required fields
   for f in agents/sdlc/constitutions/*.md; do
     echo "Checking $f..."
     grep -q "^agent_id:" "$f" || echo "  Missing agent_id"
     grep -q "^agent_name:" "$f" || echo "  Missing agent_name"
     grep -q "^version:" "$f" || echo "  Missing version"
   done
   ```

3. **Pattern references check**:
   ```bash
   # Verify pattern IDs are valid
   grep -r "\[Pattern:" agents/sdlc/constitutions/ | \
     sed 's/.*\[Pattern: \([^]]*\)\].*/\1/' | sort -u > /tmp/refs.txt

   grep -r "^## Pattern:" agents/sdlc/patterns/ | \
     sed 's/.*Pattern: \(.*\)/\1/' | sort -u > /tmp/patterns.txt

   # Find invalid references
   comm -23 /tmp/refs.txt /tmp/patterns.txt
   ```

4. **Size check**:
   ```bash
   # Each should be 150-200 lines
   for f in agents/sdlc/constitutions/*.md; do
     lines=$(wc -l < "$f")
     if [ $lines -lt 100 ] || [ $lines -gt 250 ]; then
       echo "$f: $lines lines (should be 150-200)"
     fi
   done
   ```

---

## Deliverables

After completion:

**Files created**: 15 markdown files
- agents/sdlc/constitutions/dev-02-operator.md
- agents/sdlc/constitutions/dev-03-frontend.md
- agents/sdlc/constitutions/dev-04-runner.md
- agents/sdlc/constitutions/dev-05-code-review.md
- agents/sdlc/constitutions/qa-01-backend-testing.md
- agents/sdlc/constitutions/qa-02-frontend-testing.md
- agents/sdlc/constitutions/qa-03-operator-testing.md
- agents/sdlc/constitutions/qa-04-security-testing.md
- agents/sdlc/constitutions/ops-01-cicd.md
- agents/sdlc/constitutions/ops-02-deployment.md
- agents/sdlc/constitutions/ops-03-monitoring.md
- agents/sdlc/constitutions/doc-01-technical-docs.md
- agents/sdlc/constitutions/doc-02-api-docs.md
- agents/sdlc/constitutions/mgt-01-release.md
- agents/sdlc/constitutions/mgt-02-tpm.md

**Total size**: ~95KB markdown

**Updated documents**:
- IMPLEMENTATION_STATUS.md (update completion percentages)
- README.md (update agent catalog status column)

---

## Success Criteria

Constitution framework is complete when:

1. ✅ All 16 agent constitutions exist
2. ✅ Each follows template structure
3. ✅ All pattern references are valid
4. ✅ All integration points documented
5. ✅ README.md agent catalog shows all complete
6. ✅ IMPLEMENTATION_STATUS.md shows 100% agent completion
7. ✅ Validation scripts pass (frontmatter, references, size)

---

## Next Steps After Completion

Once all constitutions are written:

1. **Manual review** of all 16 agents for consistency
2. **Update documentation** (README, IMPLEMENTATION_STATUS)
3. **Create example usage** (how to invoke each agent)
4. **Team review** (get feedback on agent definitions)
5. **Iteration** based on feedback

**Note**: Automation tooling (scripts, Makefiles) is a separate effort and not part of this plan.

---

**Ready to execute**: This plan can be executed independently. No dependencies on YAML conversion or automation tooling.

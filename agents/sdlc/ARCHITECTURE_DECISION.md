# Architecture Decision: SDLC Agent Framework

**Version**: 1.0.0
**Date**: 2025-11-06
**Status**: Proposed
**Decision**: 16-agent hybrid architecture for Ambient Code Platform

## Decision Summary

After comprehensive analysis (see `AGENT_FRAMEWORK_ANALYSIS.md`), this document specifies the final architecture for the SDLC agent framework.

**Core Decisions**:
1. **16 specialized agents** organized by development phase
2. **Hybrid file organization** (shared patterns + individual constitutions)
3. **Dual-format deployment** (markdown + ACP-native YAML)
4. **Semantic anchor references** for resilient code pointers
5. **4-phase implementation** over 4 weeks

---

## 1. Agent Architecture Specification

### 1.1 The 16-Agent Framework

#### Development Phase Agents (5 agents)

**DEV-01: Backend Development Agent**

Primary mission: Implement and maintain the Go-based backend API with strict adherence to authentication, RBAC, and multi-tenancy patterns.

Responsibilities:
- Design and implement project-scoped REST endpoints (`/api/projects/:project/*`)
- Enforce user-scoped Kubernetes client pattern (`GetK8sClientsForRequest`)
- Implement RBAC checks before all resource operations
- Ensure token redaction in all logging statements
- Maintain handler/middleware separation architecture
- Validate input and implement rate limiting

Critical patterns owned:
- User token authentication (never service account for user operations)
- Token security and redaction
- RBAC enforcement at API layer
- Input validation and sanitization
- Secret management in handlers
- Multi-tenant namespace isolation

Tools/tech expertise:
- Go 1.21+, Gin framework, Kubernetes client-go
- Dynamic client for CRD operations
- OpenShift OAuth integration
- golangci-lint, gofmt, go vet

Integration points:
- DEV-02 (Operator): CR lifecycle coordination
- QA-01 (Backend Testing): TDD workflow, contract validation
- QA-04 (Security): RBAC testing, vulnerability remediation
- DOC-02 (API Docs): OpenAPI spec synchronization

Context cost: 4,500 tokens (constitution + backend patterns + security patterns)

---

**DEV-02: Kubernetes Operator Agent**

Primary mission: Develop and maintain the Kubernetes operator with focus on watch loops, reconciliation, and resource lifecycle management.

Responsibilities:
- Implement watch loops for CRDs (AgenticSession, ProjectSettings, RFEWorkflow)
- Design reconciliation logic with idempotency guarantees
- Create and monitor Job pods for agentic sessions
- Manage resource lifecycle via OwnerReferences
- Implement goroutine-based monitoring with proper cleanup
- Update CR status via UpdateStatus subresource

Critical patterns owned:
- Type-safe unstructured Kubernetes resource access
- OwnerReferences for automatic cleanup
- SecurityContext on all Job pods
- Watch loop reconnection and error handling
- Goroutine lifecycle management
- Status updates (avoid race conditions)
- Namespace-scoped operations

Tools/tech expertise:
- Go 1.21+, Kubernetes API machinery
- Custom Resource Definitions (CRDs)
- Batch/v1 Jobs, Secrets, PVCs
- Watch interface, Informers
- Envtest for controller testing

Integration points:
- DEV-01 (Backend): CR creation and validation
- QA-03 (Operator Testing): Reconciliation testing, watch loop validation
- QA-04 (Security): RBAC policy testing, multi-tenancy validation
- OPS-02 (Deployment): CRD installation, operator upgrades

Context cost: 4,800 tokens (constitution + operator patterns + K8s patterns)

---

**DEV-03: Frontend Development Agent**

Primary mission: Build type-safe, accessible NextJS frontend using Shadcn UI components and React Query exclusively.

Responsibilities:
- Implement App Router pages with Next.js 14+ patterns
- Build UI exclusively with Shadcn components (never custom UI from scratch)
- Use React Query for ALL data operations (no manual fetch)
- Enforce zero `any` types (use `type` over `interface`)
- Colocate single-use components with their pages
- Implement loading states, error boundaries, breadcrumbs

Critical patterns owned:
- Zero `any` types in TypeScript
- Shadcn UI component library usage
- React Query hooks for state management
- Type-safe API client integration
- Client-side input validation
- Component size limits (under 200 lines)

Tools/tech expertise:
- NextJS 14+, React 18+, TypeScript strict mode
- Shadcn UI, Tailwind CSS
- React Query (TanStack Query)
- Zod for schema validation
- ESLint, Prettier

Integration points:
- DEV-01 (Backend): API contract adherence
- QA-02 (Frontend Testing): Component testing, E2E validation
- DOC-02 (API Docs): Client SDK generation
- QA-04 (Security): XSS prevention, input sanitization

Context cost: 4,500 tokens (constitution + frontend patterns + TypeScript patterns)

---

**DEV-04: Python Runner Agent**

Primary mission: Maintain the Claude Code runner implementation for executing agentic sessions in Kubernetes Jobs.

Responsibilities:
- Integrate Claude Code SDK and Anthropic API
- Handle workspace synchronization via PVC
- Implement multi-agent collaboration patterns
- Manage environment variable passthrough
- Use virtual environments (uv preferred)
- Format code with black, isort

Critical patterns owned:
- None (isolated component, minimal security surface)

Tools/tech expertise:
- Python 3.11+, Claude Code SDK (`claude-code-sdk>=0.0.23`)
- Anthropic Python SDK (`anthropic>=0.68.0`)
- black, isort, flake8, pytest
- Virtual environment management (uv)

Integration points:
- DEV-02 (Operator): Job pod specification, volume mounts
- QA-01 (Backend Testing): Runner integration tests
- OPS-02 (Deployment): Container image build

Context cost: 3,000 tokens (constitution only, no shared patterns)

---

**DEV-05: Code Review Agent**

Primary mission: Enforce all CLAUDE.md standards across backend, frontend, and operator code in pull requests.

Responsibilities:
- Review PRs for adherence to critical patterns
- Validate backend authentication patterns (user-scoped clients, no service account misuse)
- Check frontend type safety (zero `any`, React Query usage)
- Verify operator patterns (OwnerReferences, watch reconnection, idempotency)
- Ensure pre-commit checklists followed
- Validate test coverage and quality

Critical patterns owned:
- All 14 critical security patterns (enforcement role)
- Code organization standards
- Testing requirements
- Documentation completeness

Tools/tech expertise:
- All language-specific linters (golangci-lint, ESLint, flake8)
- GitHub Actions workflow understanding
- Pattern detection regex and grep

Integration points:
- All development agents (standards enforcement)
- QA-04 (Security): Security review coordination
- DOC-01 (Tech Docs): Documentation update verification

Context cost: 11,000 tokens (constitution + ALL patterns for comprehensive review)

---

#### Quality Assurance Agents (4 agents)

**QA-01: Backend Testing Agent**

Primary mission: Implement comprehensive testing for backend API with focus on RBAC enforcement and multi-tenancy boundaries.

Responsibilities:
- Write table-driven unit tests for handlers
- Implement contract tests for API endpoints (OpenAPI validation)
- Create integration tests with real Kubernetes clusters
- Test RBAC permission boundaries extensively
- Validate multi-tenant namespace isolation
- Mock Kubernetes clients appropriately

Critical patterns owned:
- RBAC permission matrix testing
- Multi-tenancy boundary validation
- Integration test setup (TEST_NAMESPACE, cleanup)

Tools/tech expertise:
- Go testing package, testify/assert, testify/mock
- Kind or real k8s cluster for integration tests
- kubectl for test setup and teardown
- OpenAPI validators

Integration points:
- DEV-01 (Backend): TDD workflow, test-first development
- QA-04 (Security): RBAC test coverage coordination
- OPS-01 (CI/CD): Automated test execution

Context cost: 5,500 tokens (constitution + backend patterns + testing patterns)

---

**QA-02: Frontend Testing Agent**

Primary mission: Ensure UI quality through E2E testing, component testing, and accessibility validation.

Responsibilities:
- Write Cypress E2E tests for critical user workflows
- Implement component tests with React Testing Library
- Validate WCAG 2.1 AA accessibility compliance
- Test responsive design and cross-browser compatibility
- Verify loading states, error states, empty states
- Test form validation and error handling

Critical patterns owned:
- E2E test patterns (Cypress with kind cluster)
- Component interaction testing
- Accessibility testing (axe-core)

Tools/tech expertise:
- Cypress 13+, TypeScript
- React Testing Library, Jest
- axe-core for accessibility
- Kind cluster for E2E environment

Integration points:
- DEV-03 (Frontend): TDD workflow, component validation
- OPS-01 (CI/CD): E2E test automation in GitHub Actions
- QA-04 (Security): UI security testing (XSS, CSRF)

Context cost: 5,200 tokens (constitution + frontend patterns + testing patterns)

---

**QA-03: Operator Testing Agent**

Primary mission: Validate operator reconciliation logic, watch loops, and resource lifecycle management.

Responsibilities:
- Test watch loop reconnection on failures
- Validate reconciliation idempotency
- Test Job creation and monitoring
- Verify resource cleanup via OwnerReferences
- Test goroutine lifecycle and cleanup
- Integration tests with real CRDs and Jobs

Critical patterns owned:
- Operator reconciliation testing
- Watch event handling validation
- Resource leak detection

Tools/tech expertise:
- Go testing package
- Envtest (controller-runtime)
- Mock Kubernetes clients
- Kind clusters for integration

Integration points:
- DEV-02 (Operator): TDD workflow, pattern validation
- QA-01 (Backend): CR lifecycle integration tests
- OPS-02 (Deployment): Upgrade testing

Context cost: 6,000 tokens (constitution + operator patterns + testing patterns)

---

**QA-04: Security Testing Agent**

Primary mission: Comprehensive security validation across all components with focus on RBAC, multi-tenancy, and vulnerability detection.

Responsibilities:
- Conduct container image vulnerability scanning (Trivy, Grype)
- Test RBAC enforcement and permission boundaries
- Validate token handling and redaction
- Perform penetration testing on API endpoints
- Test multi-tenancy isolation guarantees
- Validate SecurityContext on all pods

Critical patterns owned:
- RBAC policy validation
- Multi-tenancy security testing
- Container vulnerability scanning
- Secret management validation

Tools/tech expertise:
- Trivy, Snyk, Grype for image scanning
- kubectl auth can-i for RBAC testing
- OWASP ZAP for API penetration testing
- gosec, semgrep for static analysis

Integration points:
- DEV-01, DEV-02, DEV-03 (All Dev): Security findings remediation
- DEV-05 (Code Review): Security pattern enforcement
- OPS-01 (CI/CD): Automated security scanning

Context cost: 6,300 tokens (constitution + security patterns + backend patterns + operator patterns)

---

#### Operations Agents (3 agents)

**OPS-01: CI/CD Orchestration Agent**

Primary mission: Maintain GitHub Actions workflows with component-specific build optimization and automated testing.

Responsibilities:
- Maintain 13 GitHub Actions workflows
- Implement change detection for component builds (dorny/paths-filter)
- Manage multi-platform container builds (amd64, arm64)
- Coordinate automated testing (unit, integration, E2E)
- Manage Dependabot integration and auto-merge
- Implement image vulnerability scanning in CI

Critical patterns owned:
- Build automation patterns
- Component change detection
- Image scanning automation (Trivy in CI)

Tools/tech expertise:
- GitHub Actions, YAML workflows
- Docker buildx (multi-platform)
- Artifact management
- Dependabot configuration

Integration points:
- All QA agents (automated test execution)
- OPS-02 (Deployment): Build artifacts → deployment
- QA-04 (Security): Image scanning in pipeline

Context cost: 5,000 tokens (constitution + deployment patterns)

---

**OPS-02: Kubernetes Deployment Agent**

Primary mission: Deploy and manage the platform across Kubernetes/OpenShift clusters with Kustomize overlays.

Responsibilities:
- Deploy platform using Kustomize overlays (base, e2e, production)
- Install and upgrade CRDs safely
- Apply RBAC roles and bindings
- Configure Ingress/Routes
- Manage rolling updates and rollbacks
- Coordinate namespace provisioning

Critical patterns owned:
- Kustomize overlay management
- CRD installation and upgrade procedures
- Resource management patterns

Tools/tech expertise:
- kubectl, oc (OpenShift CLI)
- Kustomize
- Kubernetes RBAC, networking
- Helm (if applicable)

Integration points:
- OPS-01 (CI/CD): Deployment automation
- DEV-02 (Operator): CRD compatibility
- OPS-03 (Monitoring): Deployment health validation

Context cost: 5,500 tokens (constitution + deployment patterns + K8s patterns)

---

**OPS-03: Monitoring & Observability Agent**

Primary mission: Implement metrics collection, logging aggregation, and alerting for production operations.

Responsibilities:
- Implement Prometheus metrics collection
- Set up logging aggregation (Loki or ELK)
- Configure alerting rules and SLO dashboards
- Monitor operator reconciliation metrics
- Track pod/container resource usage
- Implement health check endpoints

Critical patterns owned:
- Observability patterns (metrics, logs, traces)
- SLO definition and monitoring
- Alert threshold configuration

Tools/tech expertise:
- Prometheus, Grafana
- Loki or ELK stack
- Kubernetes events
- prometheus-client libraries

Integration points:
- All dev agents (instrumentation requirements)
- OPS-02 (Deployment): Monitoring stack deployment
- MGT-01 (Release): Release health validation

Context cost: 4,500 tokens (constitution + deployment patterns)

---

#### Documentation Agents (2 agents)

**DOC-01: Technical Documentation Agent**

Primary mission: Maintain project documentation including CLAUDE.md, component READMEs, and MkDocs site.

Responsibilities:
- Update CLAUDE.md with new patterns and standards
- Write component-specific READMEs (backend, frontend, operator, runner)
- Maintain MkDocs documentation site
- Document architecture decisions (ADRs)
- Create developer setup guides
- Run markdownlint on all markdown

Critical patterns owned:
- Documentation standards
- Pattern documentation format

Tools/tech expertise:
- Markdown, MkDocs
- markdownlint
- Mermaid for diagrams
- Git for version control

Integration points:
- All dev agents (pattern documentation)
- DEV-05 (Code Review): Documentation completeness checks
- MGT-02 (TPM): Onboarding documentation

Context cost: 4,000 tokens (constitution + documentation patterns)

---

**DOC-02: API Documentation Agent**

Primary mission: Generate and maintain OpenAPI specifications and API reference documentation.

Responsibilities:
- Generate OpenAPI 3.0+ specifications from backend code
- Document WebSocket message formats
- Create API usage examples and guides
- Maintain endpoint reference documentation
- Generate client SDKs (if applicable)
- Keep Postman collections updated

Critical patterns owned:
- API documentation standards
- OpenAPI schema patterns

Tools/tech expertise:
- OpenAPI 3.0+, Swagger UI, Redoc
- Postman for collections
- API documentation generators

Integration points:
- DEV-01 (Backend): API changes synchronization
- DEV-03 (Frontend): Client SDK usage
- QA-01 (Backend Testing): Contract test validation

Context cost: 3,800 tokens (constitution + backend patterns)

---

#### Management & Coordination Agents (2 agents)

**MGT-01: Release Management Agent**

Primary mission: Coordinate release branches, versioning, and production deployments.

Responsibilities:
- Manage release branches and versioning (semantic versioning)
- Coordinate release cutoffs and code freezes
- Generate release notes and changelogs
- Orchestrate production deployments
- Track rollback procedures
- Manage deprecation notices

Critical patterns owned:
- Release process patterns
- Version compatibility management

Tools/tech expertise:
- Git branching strategies
- GitHub Releases
- Semantic versioning
- Deployment scripts

Integration points:
- OPS-01 (CI/CD): Release automation
- OPS-02 (Deployment): Production rollout
- DOC-01 (Tech Docs): Release notes

Context cost: 4,200 tokens (constitution + deployment patterns)

---

**MGT-02: Technical Program Manager Agent**

Primary mission: Coordinate cross-component feature development and manage SDLC dependencies.

Responsibilities:
- Track dependencies across components (backend ↔ frontend ↔ operator)
- Identify and mitigate risks
- Facilitate cross-functional communication
- Manage project timelines and milestones
- Coordinate blocker resolution
- Report status to stakeholders

Critical patterns owned:
- SDLC orchestration patterns
- Dependency tracking patterns

Tools/tech expertise:
- GitHub Projects (repository-level)
- Timeline and Gantt tools
- Communication platforms (Slack, email)

Integration points:
- All agents (coordination hub)
- Product Owner (roadmap alignment)
- Engineering leads (capacity planning)

Context cost: 5,000 tokens (constitution + all patterns for coordination awareness)

---

## 2. File Organization Architecture

### 2.1 Directory Structure

```
agents/sdlc/
├── AGENT_FRAMEWORK_ANALYSIS.md          # Comprehensive analysis (this led to decisions)
├── ARCHITECTURE_DECISION.md             # This document
├── LIFECYCLE_MANAGEMENT.md              # Reference strategy, versioning
├── patterns/                            # Shared pattern library (6 files)
│   ├── backend-patterns.md              # 1,800 tokens
│   ├── operator-patterns.md             # 1,800 tokens
│   ├── frontend-patterns.md             # 1,800 tokens
│   ├── security-patterns.md             # 1,200 tokens
│   ├── testing-patterns.md              # 1,500 tokens
│   └── deployment-patterns.md           # 1,500 tokens
└── constitutions/                       # 16 agents × 2 formats = 32 files
    ├── dev-01-backend.md                # Generic markdown (1,500 tokens)
    ├── dev-01-backend.acp.yaml          # ACP-native format
    ├── dev-02-operator.md
    ├── dev-02-operator.acp.yaml
    ├── dev-03-frontend.md
    ├── dev-03-frontend.acp.yaml
    ├── dev-04-runner.md
    ├── dev-04-runner.acp.yaml
    ├── dev-05-code-review.md
    ├── dev-05-code-review.acp.yaml
    ├── qa-01-backend-testing.md
    ├── qa-01-backend-testing.acp.yaml
    ├── qa-02-frontend-testing.md
    ├── qa-02-frontend-testing.acp.yaml
    ├── qa-03-operator-testing.md
    ├── qa-03-operator-testing.acp.yaml
    ├── qa-04-security-testing.md
    ├── qa-04-security-testing.acp.yaml
    ├── ops-01-cicd.md
    ├── ops-01-cicd.acp.yaml
    ├── ops-02-deployment.md
    ├── ops-02-deployment.acp.yaml
    ├── ops-03-monitoring.md
    ├── ops-03-monitoring.acp.yaml
    ├── doc-01-technical-docs.md
    ├── doc-01-technical-docs.acp.yaml
    ├── doc-02-api-docs.md
    ├── doc-02-api-docs.acp.yaml
    ├── mgt-01-release.md
    ├── mgt-01-release.acp.yaml
    ├── mgt-02-tpm.md
    └── mgt-02-tpm.acp.yaml
```

**Total files**: 41 (3 root docs + 6 patterns + 32 constitutions)

### 2.2 Dual-Format Strategy

**Markdown format** (`.md` files):
- Source of truth for all agent constitutions
- Universal compatibility (Claude Code, ChatGPT, custom tools)
- Human-readable, easy to edit and review
- Git-friendly diffs

**ACP-native format** (`.acp.yaml` files):
- Generated from markdown via `make generate-acp-agents`
- Compatible with RFE workflow and agent framework
- Enables dogfooding (platform tests itself)
- Structured metadata for automation

**Conversion workflow**:
```bash
# Manual conversion
make generate-acp-agents

# Automated (pre-commit hook)
.git/hooks/pre-commit:
  #!/bin/bash
  make generate-acp-agents
  git add agents/sdlc/constitutions/*.acp.yaml
```

**Validation**:
- Pre-commit hook ensures YAML matches markdown
- CI job validates all `.acp.yaml` files parse correctly
- Integration test: create RFE using `.acp.yaml` agent

---

## 3. Pattern Reference Strategy

### 3.1 Semantic Anchors

**Problem**: Traditional file:line references break when code changes.

Example:
```
❌ Brittle: See handlers/sessions.go:227 for correct pattern
✅ Resilient: See handlers/sessions.go::GetK8sClientsForRequest for correct pattern
```

**Anchor format**:
```
file_path::function_name
file_path::StructName::MethodName
file_path::ConstantName
```

**Grep-ability**:
```bash
# Find implementation of pattern
grep -n "func GetK8sClientsForRequest" components/backend/handlers/*.go

# Validate pattern still exists
grep -q "GetK8sClientsForRequest" components/backend/handlers/middleware.go || echo "Pattern moved!"
```

### 3.2 Pattern Library Structure

Each pattern document (`patterns/*.md`) follows this structure:

```markdown
# [Category] Patterns

## Pattern: pattern-id-in-kebab-case

**Version**: 1.0
**Last Updated**: 2025-11-06
**Stability**: Stable | Evolving | Deprecated

**Location**: file_path::symbol_name
**Grep Anchor**: `grep_regex_pattern`

**Description**:
Brief description of what this pattern does and why it exists.

**Correct Usage**:
```go
// Example code showing correct implementation
func ExampleCorrectUsage() {
    // ...
}
```

**Anti-Patterns**:
```go
// ❌ Wrong: Explanation of what's wrong
func ExampleWrongUsage() {
    // ...
}
```

**Detection**:
- ✅ Correct indicator: `grep pattern for correct usage`
- ❌ Wrong indicator: `grep pattern for anti-pattern`

**Related Patterns**: [Pattern: other-pattern-id]

**Change History**:
- v1.0 (2025-11-06): Initial pattern definition
```

### 3.3 Anti-Pattern Library

Embedded in each pattern document with detection methods:

```markdown
## Anti-Pattern: service-account-for-user-operations

**Severity**: CRITICAL
**Category**: Authentication / RBAC

**Description**:
Using the backend service account (DynamicClient, K8sClient) for user-initiated API operations bypasses RBAC and violates multi-tenancy isolation.

**Detection Regex**:
```bash
# Find violations in handlers
grep -n "DynamicClient\.Resource.*\.List\|K8sClient\.CoreV1" components/backend/handlers/*.go
```

**Correct Pattern**: [Pattern: user-scoped-k8s-client-creation]

**Remediation**:
Replace service account client usage with user-scoped clients:
```go
// ❌ Wrong
list, err := DynamicClient.Resource(gvr).Namespace(project).List(ctx, v1.ListOptions{})

// ✅ Correct
reqK8s, reqDyn := GetK8sClientsForRequest(c)
if reqK8s == nil {
    c.JSON(http.StatusUnauthorized, gin.H{"error": "Invalid token"})
    return
}
list, err := reqDyn.Resource(gvr).Namespace(project).List(ctx, v1.ListOptions{})
```
```

---

## 4. Implementation Roadmap

### 4.1 Phase 1: Critical Security (Week 1)

**Goal**: Zero RBAC violations and security pattern enforcement

**Agents to implement**:
1. DEV-01 (Backend Development)
2. DEV-02 (Kubernetes Operator)
3. DEV-05 (Code Review)
4. QA-04 (Security Testing)

**Deliverables**:
- 4 agent constitutions in dual format (8 files)
- Backend patterns document (1,800 tokens)
- Operator patterns document (1,800 tokens)
- Security patterns document (1,200 tokens)

**Success criteria**:
- Zero service account misuse in new PRs
- All endpoints have RBAC checks (validated by QA-04)
- Code review agent catches 95%+ of pattern violations
- All Job pods have SecurityContext

**Risk mitigation**:
- Pair automated review with manual security review initially
- Weekly security audit for first 4 weeks
- Immediate rollback if violation reaches production

### 4.2 Phase 2: Development Loop (Week 2)

**Goal**: TDD workflow functional for frontend and backend

**Agents to implement**:
5. DEV-03 (Frontend Development)
6. QA-01 (Backend Testing)
7. QA-02 (Frontend Testing)

**Deliverables**:
- 3 agent constitutions in dual format (6 files)
- Frontend patterns document (1,800 tokens)
- Testing patterns document (1,500 tokens)

**Success criteria**:
- Zero `any` types in new frontend code
- 80%+ backend test coverage maintained
- E2E tests run successfully in CI
- TDD workflow adopted by team

**Risk mitigation**:
- Keep existing code review process in parallel
- Gradual rollout: volunteers first, then team-wide
- Weekly retrospective on agent effectiveness

### 4.3 Phase 3: Operations (Week 3)

**Goal**: Automated builds, deployments, and monitoring

**Agents to implement**:
8. OPS-01 (CI/CD Orchestration)
9. OPS-02 (Kubernetes Deployment)
10. OPS-03 (Monitoring & Observability)
11. QA-03 (Operator Testing)

**Deliverables**:
- 4 agent constitutions in dual format (8 files)
- Deployment patterns document (1,500 tokens)

**Success criteria**:
- 95%+ build success rate
- Zero manual deployment steps
- All components have health checks
- Operator tests cover reconciliation edge cases

**Risk mitigation**:
- Manual deployment fallback for first 2 weeks
- Canary deployments for operator changes
- Rollback playbook tested and documented

### 4.4 Phase 4: Full Coverage (Week 4)

**Goal**: All SDLC phases covered by specialized agents

**Agents to implement**:
12. DEV-04 (Python Runner)
13. DOC-01 (Technical Documentation)
14. DOC-02 (API Documentation)
15. MGT-01 (Release Management)
16. MGT-02 (Technical Program Manager)

**Deliverables**:
- 5 agent constitutions in dual format (10 files)
- All documentation updated with agent workflows

**Success criteria**:
- All agents operational
- Documentation in sync with code
- Release process automated
- Team using agents daily

**Risk mitigation**:
- Gradual rollout per agent
- Feedback loops with team
- Monthly retrospective on framework effectiveness

---

## 5. Validation and Metrics

### 5.1 Per-Agent Metrics

| Agent ID | Primary Metric | Target | Measurement | Review Frequency |
|----------|---------------|--------|-------------|------------------|
| DEV-01 | RBAC violations per PR | 0 | Code review + automated checks | Weekly |
| DEV-02 | Resource leak incidents | 0 | Integration tests + production monitoring | Weekly |
| DEV-03 | `any` type count | 0 | TypeScript compiler + ESLint | Daily (CI) |
| DEV-04 | Runner failures | <5% | Job failure rate in production | Weekly |
| DEV-05 | Pattern violations detected | 95%+ | Manual audit of PR reviews | Monthly |
| QA-01 | Backend test coverage | 80%+ | Go test coverage report | Weekly |
| QA-02 | E2E test pass rate | 95%+ | Cypress test results | Daily (CI) |
| QA-03 | Operator test coverage | 75%+ | Go test coverage report | Weekly |
| QA-04 | Known vulnerability detection | 100% | Trivy + manual pentesting | Weekly |
| OPS-01 | Build success rate | 95%+ | GitHub Actions metrics | Daily |
| OPS-02 | Deployment success rate | 98%+ | Deployment logs | Weekly |
| OPS-03 | Alert false positive rate | <10% | Manual alert review | Weekly |
| DOC-01 | Doc-code synchronization | 100% | Manual quarterly audit | Quarterly |
| DOC-02 | API doc completeness | 100% endpoints | OpenAPI coverage | Monthly |
| MGT-01 | Release cycle time | <2 weeks | Release cadence tracking | Monthly |
| MGT-02 | Blocker resolution time | <48 hours | Issue tracking | Weekly |

### 5.2 Framework-Level Metrics

| Metric | Target | Measurement | Review |
|--------|--------|-------------|--------|
| **Context efficiency** | <5% average per invocation | Token usage monitoring | Weekly |
| **Agent coordination overhead** | <12 handoffs per feature | Feature delivery tracking | Monthly |
| **Pattern coverage** | 100% critical patterns owned | Pattern ownership matrix | Quarterly |
| **Team adoption rate** | 80%+ daily usage | User surveys | Monthly |
| **Violation escape rate** | <2% violations reach production | Production incident analysis | Weekly |
| **Time to resolution** (agent-suggested fixes) | <24 hours | Issue tracking | Weekly |
| **Developer satisfaction** | 8/10+ | Quarterly survey | Quarterly |

### 5.3 Validation Gates

**Before Phase 1 completion**:
- [ ] All security patterns have automated detection
- [ ] Code review agent catches test injection of violations (95%+)
- [ ] Manual security audit confirms zero RBAC bypass possible

**Before Phase 2 completion**:
- [ ] TDD workflow demonstrated end-to-end
- [ ] Test coverage metrics tracked in CI
- [ ] All new features have corresponding tests

**Before Phase 3 completion**:
- [ ] CI/CD pipeline runs without manual intervention
- [ ] Deployment documented and tested
- [ ] Rollback procedure validated

**Before Phase 4 completion**:
- [ ] All 16 agents operational
- [ ] Documentation complete and validated
- [ ] Team trained on agent framework
- [ ] Retrospective conducted, learnings documented

---

## 6. Dogfooding Strategy

### 6.1 Platform Self-Improvement Loop

The Ambient Code Platform can use its own RFE workflow to improve agent constitutions:

**Workflow**:
1. Developer identifies agent improvement opportunity
2. Create RFE: "Improve Backend Development Agent to handle..."
3. RFE council agents review (use existing team agents)
4. Implementation creates new agent constitution version
5. Testing validates improvement
6. New constitution deployed (`.acp.yaml` update)

**Example RFE**:
```yaml
# .acp.yaml format
apiVersion: vteam.ambient-code/v1alpha1
kind: AgenticSession
metadata:
  name: improve-backend-agent-rate-limiting
spec:
  prompt: |
    Review the DEV-01 Backend Development Agent constitution and add
    comprehensive rate limiting pattern guidance. Include:
    - When to implement rate limiting
    - Go middleware patterns for Gin
    - Redis-backed rate limiting example
    - Testing strategies for rate limits
    Update agents/sdlc/constitutions/dev-01-backend.md
  repos:
    - input:
        url: https://github.com/your-org/platform
        branch: main
      output:
        mode: pr
        target: main
```

### 6.2 Continuous Improvement

**Monthly agent reviews**:
- Analyze agent effectiveness metrics
- Collect team feedback on agent quality
- Identify missing patterns or unclear guidance
- Update constitutions based on new patterns discovered

**Quarterly agent evolution**:
- Major version updates to constitutions
- Pattern library expansion
- New agents added if needed
- Deprecated agents retired

**Agent versioning**:
- Constitution metadata tracks version
- Breaking changes require major version bump
- CHANGELOG.md tracks all agent updates

---

## 7. Decision Justification Summary

### 7.1 Why 16 Agents?

**Data-driven decision** (see AGENT_FRAMEWORK_ANALYSIS.md Section 1):
- 8.95/10 suitability score (highest among options)
- 8-12 handoffs per feature (52% less than 26-agent)
- 24% context usage vs 39% for 26-agent
- Optimal balance: specialization depth + coordination efficiency

**Codebase-specific factors**:
- 14 critical security patterns require dedicated expertise
- Multi-language stack (Go/TS/Python) needs per-language agents
- Kubernetes complexity warrants separate backend/operator agents
- Testing complexity requires 4 specialized QA agents

### 7.2 Why Hybrid File Organization?

**Efficiency gains**:
- 90% context savings vs monolith (4,500 tokens vs 48,000)
- 9.4/10 developer experience score (52% higher than alternatives)
- DRY principle: shared patterns eliminate redundancy
- Precise loading: only load relevant patterns per agent

**Maintenance benefits**:
- Low update complexity (modify single agent file)
- Automatic consistency (shared patterns = single source of truth)
- Clear separation of concerns (patterns vs constitutions)
- Version control friendly (small, focused diffs)

### 7.3 Why Dual Format?

**Universal compatibility**:
- Markdown: Works with any AI system (Claude Code, ChatGPT, custom tools)
- Portability: Easy to share, copy, adapt for other projects

**Platform integration**:
- YAML: Native RFE workflow support
- Dogfooding: Platform tests and improves itself
- Automation: Structured metadata enables tooling

**Low maintenance cost**:
- Markdown is source of truth (edit once)
- YAML generated automatically (`make generate-acp-agents`)
- Pre-commit hook ensures synchronization

### 7.4 Why Semantic Anchors?

**Resilience to refactoring**:
- Function names survive line number changes
- Grep patterns enable automated validation
- Semantic meaning clearer than line numbers

**Developer experience**:
- `file::function` more intuitive than `file:123`
- IDE navigation works with function names
- Self-documenting references

**Automation-friendly**:
- Can detect if pattern moved or deleted
- Enable automated pattern usage analysis
- Support tooling for pattern enforcement

---

## 8. Next Steps

### 8.1 Immediate Actions

1. **Review and approve this architecture** (stakeholder sign-off)
2. **Create pattern library** (6 pattern documents)
3. **Implement Phase 1 agents** (4 agents in week 1)
4. **Set up conversion tooling** (`make generate-acp-agents`)
5. **Create validation tests** (agent constitution parsing, pattern detection)

### 8.2 Week 1 Deliverables

- [ ] All pattern library documents created and reviewed
- [ ] 4 Phase 1 agent constitutions written in dual format
- [ ] Conversion tooling implemented and tested
- [ ] Pre-commit hook configured
- [ ] Phase 1 validation gates passed

### 8.3 Success Criteria for Full Rollout

By end of Week 4:
- [ ] All 16 agents operational
- [ ] Zero security violations in production
- [ ] 80%+ team adoption rate
- [ ] Framework metrics tracked and reviewed
- [ ] Dogfooding demonstrated (platform improves own agents)
- [ ] Documentation complete and team trained

---

**Status**: Ready for implementation pending approval
**Owner**: Jeremy Eder (Distinguished Engineer)
**Reviewers**: Engineering leadership, security team
**Timeline**: 4 weeks from approval to full rollout

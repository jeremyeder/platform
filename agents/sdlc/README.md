# SDLC Agent Framework for Ambient Code Platform

**Version**: 1.0.0
**Status**: Phase 2 Complete (All Agent Constitutions)
**Last Updated**: 2025-11-06

## Overview

This directory contains the complete SDLC (Software Development Lifecycle) agent framework for the Ambient Code Platform. The framework consists of 15 specialized agents (skipped mgt-02-tpm) organized into 5 categories, supported by a shared pattern library.

## Directory Structure

```
agents/sdlc/
├── README.md                            # This file
├── AGENT_FRAMEWORK_ANALYSIS.md          # Comprehensive comparison and analysis
├── ARCHITECTURE_DECISION.md             # Technical justifications and roadmap
├── LIFECYCLE_MANAGEMENT.md              # Versioning, references, maintenance
├── patterns/                            # Shared pattern library (6 files)
│   ├── backend-patterns.md              # Go API, handlers, RBAC
│   ├── operator-patterns.md             # K8s operator, CRDs, reconciliation
│   ├── frontend-patterns.md             # NextJS, TypeScript, Shadcn UI
│   ├── security-patterns.md             # Multi-tenancy, secrets, XSS
│   ├── testing-patterns.md              # Unit, integration, E2E
│   └── deployment-patterns.md           # CI/CD, containers, K8s
├── constitutions/                       # Agent constitutions (15 files)
│   ├── dev-01-backend.md                # ✅ Backend Development
│   ├── dev-02-operator.md               # ✅ Kubernetes Operator
│   ├── dev-03-frontend.md               # ✅ Frontend Development
│   ├── dev-04-runner.md                 # ✅ Python Runner
│   ├── dev-05-code-review.md            # ✅ Code Review
│   ├── qa-01-backend-testing.md         # ✅ Backend Testing
│   ├── qa-02-frontend-testing.md        # ✅ Frontend Testing
│   ├── qa-03-operator-testing.md        # ✅ Operator Testing
│   ├── qa-04-security-testing.md        # ✅ Security Testing
│   ├── ops-01-cicd.md                   # ✅ CI/CD Orchestration
│   ├── ops-02-deployment.md             # ✅ Kubernetes Deployment
│   ├── ops-03-monitoring.md             # ✅ Monitoring & Observability
│   ├── doc-01-technical-docs.md         # ✅ Technical Documentation
│   ├── doc-02-api-docs.md               # ✅ API Documentation
│   └── mgt-01-release.md                # ✅ Release Management
├── scripts/                             # Validation and automation scripts
│   ├── validate-agent-references.sh     # ✅ Validate semantic anchors
│   └── validate-pattern-library.sh      # ✅ Validate pattern consistency
└── AGENT_RELATIONSHIPS.md               # ✅ Mermaid diagrams of agent integrations
```

## Quick Start

### Using an Agent

1. **Identify the right agent** for your task (see Agent Catalog below)
2. **Load the agent constitution**: `cat constitutions/dev-01-backend.md`
3. **Review relevant patterns**: Check "Reference Patterns" section in constitution
4. **Follow the agent's guidance** for implementation

### For Claude Code

```bash
# Use agent in Claude Code session
claude --agent agents/sdlc/constitutions/dev-01-backend.md

# Or reference in prompt
Please act as the Backend Development Agent defined in agents/sdlc/constitutions/dev-01-backend.md
```

### For ACP Platform (Dogfooding)

```yaml
# Use ACP-native format in RFE workflow
apiVersion: vteam.ambient-code/v1alpha1
kind: AgenticSession
spec:
  agent: dev-01-backend  # References constitutions/dev-01-backend.acp.yaml
  prompt: "Implement rate limiting for backend API"
```

## Agent Catalog

### Development Phase (5 agents)

| ID | Agent | Status | Purpose | Key Patterns |
|----|-------|--------|---------|--------------|
| DEV-01 | Backend Development | ✅ Complete | Go API, handlers, RBAC | user-scoped auth, token security, error handling |
| DEV-02 | Kubernetes Operator | ✅ Complete | CRD watches, reconciliation | type-safe unstructured, OwnerReferences, watch loops |
| DEV-03 | Frontend Development | ✅ Complete | NextJS, Shadcn UI, React Query | zero `any` types, Shadcn only, React Query for data |
| DEV-04 | Python Runner | ✅ Complete | Claude Code SDK integration | (isolated component, minimal patterns) |
| DEV-05 | Code Review | ✅ Complete | Standards enforcement | ALL patterns (comprehensive review) |

### Quality Assurance (4 agents)

| ID | Agent | Status | Purpose | Key Patterns |
|----|-------|--------|---------|--------------|
| QA-01 | Backend Testing | ✅ Complete | Unit/integration/contract tests | table-driven tests, mock K8s clients, RBAC testing |
| QA-02 | Frontend Testing | ✅ Complete | Cypress E2E, component tests | E2E patterns, accessibility, loading states |
| QA-03 | Operator Testing | ✅ Complete | Reconciliation, watch loops | operator patterns validation, integration tests |
| QA-04 | Security Testing | ✅ Complete | Vulnerability scanning, pentesting | RBAC enforcement, multi-tenancy, image scanning |

### Operations (3 agents)

| ID | Agent | Status | Purpose | Key Patterns |
|----|-------|--------|---------|--------------|
| OPS-01 | CI/CD Orchestration | ✅ Complete | GitHub Actions, builds, testing | change detection, multi-platform builds, image scanning |
| OPS-02 | Kubernetes Deployment | ✅ Complete | Kustomize, CRDs, rollouts | overlay management, CRD installation, rolling updates |
| OPS-03 | Monitoring & Observability | ✅ Complete | Metrics, logging, alerting | health checks, SLOs, dashboards |

### Documentation (2 agents)

| ID | Agent | Status | Purpose | Key Patterns |
|----|-------|--------|---------|--------------|
| DOC-01 | Technical Documentation | ✅ Complete | CLAUDE.md, READMEs, MkDocs | documentation standards, pattern documentation |
| DOC-02 | API Documentation | ✅ Complete | OpenAPI, endpoint reference | API doc standards, contract documentation |

### Management & Coordination (1 agent)

| ID | Agent | Status | Purpose | Key Patterns |
|----|-------|--------|---------|--------------|
| MGT-01 | Release Management | ✅ Complete | Versioning, deployment coordination | release process, version compatibility |

## Implementation Status

### Phase 2 Complete ✅
- ✅ Directory structure created
- ✅ AGENT_FRAMEWORK_ANALYSIS.md (comprehensive analysis with comparison tables)
- ✅ ARCHITECTURE_DECISION.md (16-agent architecture with technical justifications)
- ✅ LIFECYCLE_MANAGEMENT.md (semantic anchors, versioning, automation)
- ✅ All 6 pattern library documents (31 patterns total)
- ✅ All 15 agent constitutions in markdown format
- ✅ AGENT_RELATIONSHIPS.md (6 Mermaid diagrams showing integration points)
- ✅ Core validation scripts (validate-agent-references.sh, validate-pattern-library.sh)

### Phase 3 In Progress 🔨
- 🔨 Extended validation scripts (anti-pattern detection, unused patterns, etc.)
- 📅 Pre-commit hooks configuration
- 📅 CI/CD workflows for validation

## Next Steps

1. **Run validation scripts** to verify all agent constitutions:
   ```bash
   cd agents/sdlc
   ./scripts/validate-agent-references.sh
   ./scripts/validate-pattern-library.sh
   ```

2. **Complete extended validation scripts** (anti-pattern detection, etc.)

3. **Set up CI/CD automation**:
   - GitHub Actions workflows for validation
   - Pre-commit hooks
   - Weekly maintenance jobs

## Pattern Library Summary

### backend-patterns.md (6 patterns)
- user-scoped-k8s-client-creation
- token-security-and-redaction
- rbac-enforcement-api-layer
- error-handling-no-panics
- project-scoped-endpoint-hierarchy
- input-validation-and-sanitization

### operator-patterns.md (7 patterns)
- type-safe-unstructured-access
- ownerreferences-lifecycle
- watch-loop-reconnection
- status-subresource-updates
- goroutine-lifecycle-management
- securitycontext-job-pods
- reconciliation-idempotency (referenced but detailed in CLAUDE.md)

### frontend-patterns.md (5 patterns)
- zero-any-types
- shadcn-ui-components-only
- react-query-for-data-operations
- component-colocation
- loading-and-error-states

### security-patterns.md (3 patterns)
- multi-tenant-namespace-isolation
- secret-management-handlers
- input-sanitization-xss-prevention

### testing-patterns.md (4 patterns)
- table-driven-tests-go
- mock-k8s-clients-go
- integration-tests-cleanup
- cypress-e2e-patterns

### deployment-patterns.md (6 patterns)
- component-change-detection
- multi-platform-container-builds
- container-image-scanning
- kustomize-overlay-management
- crd-installation-upgrade
- rolling-updates-zero-downtime

**Total**: 31 documented patterns covering all critical aspects of the codebase

## Usage Examples

### Example 1: Implementing a New Backend Endpoint

```bash
# 1. Load Backend Development Agent
cat agents/sdlc/constitutions/dev-01-backend.md

# 2. Reference relevant patterns
cat agents/sdlc/patterns/backend-patterns.md | grep -A 50 "user-scoped-k8s-client-creation"

# 3. Implement following pattern guidance
# 4. Run validation
./scripts/detect-anti-patterns.sh

# 5. Get code review
# Load DEV-05 (Code Review Agent) once created
```

### Example 2: Fixing an Operator Bug

```bash
# Load Operator Development Agent (when created)
cat agents/sdlc/constitutions/dev-02-operator.md

# Check for common anti-patterns
grep -r "panic(" components/operator/
grep -r 'Object\[".*"\]\.\((' components/operator/
```

## Maintenance

### Weekly (Automated)
- Validate semantic anchors: `./scripts/validate-agent-references.sh`
- Check pattern library: `./scripts/validate-pattern-library.sh`
- Find unused patterns: `./scripts/find-unused-patterns.sh`

### Monthly (Manual)
- Review agent effectiveness metrics
- Update patterns based on code evolution
- Identify new patterns from recent PRs

### Quarterly (Team Review)
- Pattern library coverage analysis
- Agent constitution refinement
- Success metrics review

## Success Metrics

| Metric | Target | Current | Status |
|--------|--------|---------|--------|
| Agent constitutions complete | 16/16 | 1/16 | 🔨 In Progress |
| Pattern library completeness | 100% critical patterns | 31 patterns | ✅ Complete |
| Documentation completeness | All 3 core docs | 3/3 | ✅ Complete |
| Validation automation | 100% | 0% | 🔨 Pending |
| Team adoption | 80%+ daily usage | N/A | 📅 Not started |

## Contributing

To add or update an agent constitution:

1. Edit the markdown file in `constitutions/`
2. Run `make generate-acp-agents` to generate YAML
3. Validate with `./scripts/validate-agent-references.sh`
4. Commit both `.md` and `.acp.yaml` files

## Support

- **Questions**: Jeremy Eder <jeder@redhat.com>
- **Issues**: Create GitHub issue with label `agents`
- **Documentation**: See `ARCHITECTURE_DECISION.md` for detailed guidance

---

**Status Legend**:
- ✅ Complete
- 🔨 In Progress / Pending
- 📅 Not Started
- ❌ Blocked

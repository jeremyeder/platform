# Agent Relationships and Integration Points

This document provides Mermaid diagrams visualizing the relationships between agents in the SDLC framework.

## Table of Contents

1. [Complete Agent Network](#complete-agent-network)
2. [Development Agents Flow](#development-agents-flow)
3. [Quality Assurance Flow](#quality-assurance-flow)
4. [Operations Flow](#operations-flow)
5. [Documentation Flow](#documentation-flow)
6. [Integration Points Matrix](#integration-points-matrix)

---

## Complete Agent Network

High-level view of all 15 agents and their primary integration points.

```mermaid
graph TB
    %% Development Agents
    DEV01[DEV-01<br/>Backend Dev]
    DEV02[DEV-02<br/>Operator Dev]
    DEV03[DEV-03<br/>Frontend Dev]
    DEV04[DEV-04<br/>Runner Dev]
    DEV05[DEV-05<br/>Code Review]

    %% QA Agents
    QA01[QA-01<br/>Backend Testing]
    QA02[QA-02<br/>Frontend Testing]
    QA03[QA-03<br/>Operator Testing]
    QA04[QA-04<br/>Security Testing]

    %% Ops Agents
    OPS01[OPS-01<br/>CI/CD]
    OPS02[OPS-02<br/>Deployment]
    OPS03[OPS-03<br/>Monitoring]

    %% Doc Agents
    DOC01[DOC-01<br/>Technical Docs]
    DOC02[DOC-02<br/>API Docs]

    %% Management
    MGT01[MGT-01<br/>Release Mgmt]

    %% Development Flow
    DEV01 --> DEV05
    DEV02 --> DEV05
    DEV03 --> DEV05
    DEV04 --> DEV05

    %% Testing Integration
    DEV01 --> QA01
    DEV02 --> QA03
    DEV03 --> QA02
    DEV04 --> QA01

    %% Security Testing
    DEV01 --> QA04
    DEV02 --> QA04
    DEV03 --> QA04

    %% CI/CD Integration
    DEV05 --> OPS01
    QA04 --> OPS01
    OPS01 --> OPS02

    %% Deployment & Monitoring
    DEV02 --> OPS02
    OPS02 --> OPS03
    QA04 --> OPS03

    %% Documentation
    DEV01 --> DOC02
    DEV03 --> DOC02
    DEV05 --> DOC01
    DOC02 --> DOC01

    %% Release Management
    OPS01 --> MGT01
    OPS02 --> MGT01
    DOC01 --> MGT01

    %% Styling
    classDef devClass fill:#e1f5ff,stroke:#0288d1,stroke-width:2px
    classDef qaClass fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef opsClass fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef docClass fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    classDef mgtClass fill:#fce4ec,stroke:#c2185b,stroke-width:2px

    class DEV01,DEV02,DEV03,DEV04,DEV05 devClass
    class QA01,QA02,QA03,QA04 qaClass
    class OPS01,OPS02,OPS03 opsClass
    class DOC01,DOC02 docClass
    class MGT01 mgtClass
```

---

## Development Agents Flow

Detailed view of development agent interactions and code review workflow.

```mermaid
graph LR
    %% Development Agents
    DEV01[DEV-01<br/>Backend Dev<br/><small>Go + Gin</small>]
    DEV02[DEV-02<br/>Operator Dev<br/><small>K8s Operator</small>]
    DEV03[DEV-03<br/>Frontend Dev<br/><small>NextJS + React</small>]
    DEV04[DEV-04<br/>Runner Dev<br/><small>Python + Claude SDK</small>]
    DEV05[DEV-05<br/>Code Review<br/><small>Enforcement</small>]

    %% Shared Resources
    CR[(CRD Schema)]
    API[(API Contract)]
    PATTERNS[(Pattern Library)]

    %% Development Flow
    DEV01 -->|Creates CRs| CR
    DEV02 -->|Watches CRs| CR
    DEV01 -->|Exposes API| API
    DEV03 -->|Consumes API| API

    %% Operator-Runner Coordination
    DEV02 -->|Spawns Jobs| DEV04
    DEV04 -->|Job Execution| DEV02

    %% Code Review
    DEV01 -->|Submit PR| DEV05
    DEV02 -->|Submit PR| DEV05
    DEV03 -->|Submit PR| DEV05
    DEV04 -->|Submit PR| DEV05

    DEV05 -->|Validates| PATTERNS
    DEV05 -->|Approve/Request Changes| DEV01
    DEV05 -->|Approve/Request Changes| DEV02
    DEV05 -->|Approve/Request Changes| DEV03
    DEV05 -->|Approve/Request Changes| DEV04

    %% Styling
    classDef devClass fill:#e1f5ff,stroke:#0288d1,stroke-width:2px
    classDef resourceClass fill:#fff9c4,stroke:#f57f17,stroke-width:2px

    class DEV01,DEV02,DEV03,DEV04,DEV05 devClass
    class CR,API,PATTERNS resourceClass
```

---

## Quality Assurance Flow

Test coverage and security validation workflow.

```mermaid
graph TB
    %% Development Agents (input)
    DEV01[DEV-01 Backend]
    DEV02[DEV-02 Operator]
    DEV03[DEV-03 Frontend]
    DEV04[DEV-04 Runner]

    %% QA Agents
    QA01[QA-01<br/>Backend Testing<br/><small>Unit/Integration</small>]
    QA02[QA-02<br/>Frontend Testing<br/><small>E2E/Component</small>]
    QA03[QA-03<br/>Operator Testing<br/><small>Envtest/Reconciliation</small>]
    QA04[QA-04<br/>Security Testing<br/><small>CVE/RBAC/Pentest</small>]

    %% Testing Flow
    DEV01 -->|TDD Workflow| QA01
    DEV02 -->|TDD Workflow| QA03
    DEV03 -->|TDD Workflow| QA02
    DEV04 -->|Unit Tests| QA01

    %% Security Validation
    DEV01 -->|RBAC Patterns| QA04
    DEV02 -->|SecurityContext| QA04
    DEV03 -->|XSS Prevention| QA04

    %% QA Coordination
    QA01 -->|Share Mocks| QA03
    QA02 -->|API Contract Tests| QA01
    QA03 -->|RBAC Tests| QA04

    %% Results
    QA01 -->|Coverage Report| RESULTS[Test Results]
    QA02 -->|Accessibility Report| RESULTS
    QA03 -->|Reconciliation Tests| RESULTS
    QA04 -->|Security Report| RESULTS

    RESULTS -->|Gate PR Merge| CI[CI/CD Pipeline]

    %% Styling
    classDef devClass fill:#e1f5ff,stroke:#0288d1,stroke-width:2px
    classDef qaClass fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef resultClass fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px

    class DEV01,DEV02,DEV03,DEV04 devClass
    class QA01,QA02,QA03,QA04 qaClass
    class RESULTS,CI resultClass
```

---

## Operations Flow

CI/CD, deployment, and monitoring pipeline.

```mermaid
graph LR
    %% Input
    CODE[Code Changes<br/><small>main branch</small>]

    %% Ops Agents
    OPS01[OPS-01<br/>CI/CD<br/><small>Build/Test/Scan</small>]
    OPS02[OPS-02<br/>Deployment<br/><small>Kustomize/K8s</small>]
    OPS03[OPS-03<br/>Monitoring<br/><small>Metrics/Logs/Alerts</small>]
    MGT01[MGT-01<br/>Release Mgmt<br/><small>Versioning/Tagging</small>]

    %% Environments
    DEV[Dev Environment]
    STAGING[Staging Environment]
    PROD[Production Environment]

    %% Security Input
    QA04[QA-04 Security]

    %% CI/CD Flow
    CODE -->|Trigger Build| OPS01
    QA04 -->|Security Scans| OPS01

    OPS01 -->|Image Built| REGISTRY[Container Registry<br/><small>quay.io</small>]

    %% Deployment Flow
    REGISTRY -->|Pull Images| OPS02

    OPS02 -->|Deploy| DEV
    DEV -->|Smoke Tests Pass| OPS02

    OPS02 -->|Deploy| STAGING
    STAGING -->|Validation Pass| OPS02

    OPS02 -->|Deploy| PROD

    %% Monitoring
    DEV -->|Metrics/Logs| OPS03
    STAGING -->|Metrics/Logs| OPS03
    PROD -->|Metrics/Logs| OPS03

    OPS03 -->|Alerts| OPS02
    OPS03 -->|Health Checks| OPS02

    %% Release Management
    OPS01 -->|Tag Images| MGT01
    OPS02 -->|Deployment Coord| MGT01
    MGT01 -->|Version Tags| REGISTRY

    %% Styling
    classDef opsClass fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef envClass fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    classDef qaClass fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef mgtClass fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    classDef resourceClass fill:#fff9c4,stroke:#f57f17,stroke-width:2px

    class OPS01,OPS02,OPS03 opsClass
    class DEV,STAGING,PROD envClass
    class QA04 qaClass
    class MGT01 mgtClass
    class REGISTRY,CODE resourceClass
```

---

## Documentation Flow

Documentation creation, maintenance, and synchronization.

```mermaid
graph TD
    %% Development Agents (sources)
    DEV01[DEV-01 Backend]
    DEV02[DEV-02 Operator]
    DEV03[DEV-03 Frontend]
    DEV05[DEV-05 Code Review]

    %% Doc Agents
    DOC01[DOC-01<br/>Technical Docs<br/><small>CLAUDE.md/MkDocs</small>]
    DOC02[DOC-02<br/>API Docs<br/><small>OpenAPI/Swagger</small>]

    %% Doc Sources
    CODE[Source Code]
    PATTERNS[Pattern Library<br/><small>31 patterns</small>]
    CLAUDE[CLAUDE.md<br/><small>Standards</small>]

    %% Documentation Flow
    CODE -->|Extract Patterns| PATTERNS
    PATTERNS -->|Document| DOC01
    DEV05 -->|Validate Sync| DOC01

    DEV01 -->|API Implementation| DOC02
    DEV03 -->|API Consumption| DOC02

    DOC01 -->|Maintains| CLAUDE
    DOC01 -->|Maintains| MKDOCS[MkDocs Site]
    DOC01 -->|Maintains| README[Component READMEs]

    DOC02 -->|Generates| OPENAPI[OpenAPI Spec]
    DOC02 -->|Generates| SWAGGER[Swagger UI]
    DOC02 -->|Generates| POSTMAN[Postman Collection]

    %% Outputs
    MKDOCS -->|Publishes| DOCS_SITE[docs.ambient-code.io]
    SWAGGER -->|Serves| API_DOCS[/api/docs]

    %% Synchronization
    DOC01 -.->|References| DOC02
    DOC02 -.->|Embedded In| MKDOCS

    %% Styling
    classDef devClass fill:#e1f5ff,stroke:#0288d1,stroke-width:2px
    classDef docClass fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    classDef outputClass fill:#fff9c4,stroke:#f57f17,stroke-width:2px

    class DEV01,DEV02,DEV03,DEV05 devClass
    class DOC01,DOC02 docClass
    class PATTERNS,CLAUDE,MKDOCS,README,OPENAPI,SWAGGER,POSTMAN,DOCS_SITE,API_DOCS,CODE outputClass
```

---

## Integration Points Matrix

Tabular view of which agents integrate with each other.

| From/To  | DEV-01 | DEV-02 | DEV-03 | DEV-04 | DEV-05 | QA-01 | QA-02 | QA-03 | QA-04 | OPS-01 | OPS-02 | OPS-03 | DOC-01 | DOC-02 | MGT-01 |
|----------|:------:|:------:|:------:|:------:|:------:|:-----:|:-----:|:-----:|:-----:|:------:|:------:|:------:|:------:|:------:|:------:|
| **DEV-01** | - | ✓ | ✓ | - | ✓ | ✓ | - | - | ✓ | - | - | - | - | ✓ | - |
| **DEV-02** | ✓ | - | - | ✓ | ✓ | - | - | ✓ | ✓ | - | ✓ | - | - | - | - |
| **DEV-03** | ✓ | - | - | - | ✓ | - | ✓ | - | ✓ | - | - | - | - | ✓ | - |
| **DEV-04** | - | ✓ | - | - | ✓ | ✓ | - | - | - | - | - | - | - | - | - |
| **DEV-05** | ✓ | ✓ | ✓ | ✓ | - | - | - | - | ✓ | ✓ | - | - | ✓ | - | - |
| **QA-01** | ✓ | - | - | ✓ | - | - | - | - | ✓ | - | - | - | - | - | - |
| **QA-02** | - | - | ✓ | - | - | - | - | - | ✓ | - | - | - | - | - | - |
| **QA-03** | - | ✓ | - | - | - | - | - | - | ✓ | - | - | - | - | - | - |
| **QA-04** | ✓ | ✓ | ✓ | - | ✓ | ✓ | ✓ | ✓ | - | ✓ | - | ✓ | - | - | - |
| **OPS-01** | - | - | - | - | ✓ | - | - | - | ✓ | - | ✓ | - | - | - | ✓ |
| **OPS-02** | - | ✓ | - | - | - | - | - | - | - | ✓ | - | ✓ | - | - | ✓ |
| **OPS-03** | - | - | - | - | - | - | - | - | ✓ | - | ✓ | - | - | - | - |
| **DOC-01** | - | - | - | - | ✓ | - | - | - | - | - | - | - | - | ✓ | - |
| **DOC-02** | ✓ | - | ✓ | - | - | - | - | - | - | - | - | - | ✓ | - | - |
| **MGT-01** | - | - | - | - | - | - | - | - | - | ✓ | ✓ | - | ✓ | - | - |

**Legend:**
- ✓ = Direct integration point (agents coordinate on specific tasks)
- Empty = No direct integration

### Integration Type Summary

- **Development ↔ Testing**: TDD workflow, test coverage
- **Development ↔ Security**: Pattern enforcement, vulnerability prevention
- **Development ↔ Docs**: API contracts, pattern documentation
- **Testing ↔ Security**: RBAC validation, security test coordination
- **CI/CD ↔ Deployment**: Image builds, staged rollouts
- **Deployment ↔ Monitoring**: Health checks, metrics collection
- **Release ↔ Ops**: Version tagging, deployment coordination

---

## Agent Dependency Layers

Agents organized by execution order (bottom-up dependency).

```mermaid
graph BT
    %% Layer 0: Foundation
    subgraph Layer0[" Layer 0: Pattern Library "]
        PATTERNS[Pattern Library<br/><small>31 documented patterns</small>]
    end

    %% Layer 1: Development
    subgraph Layer1[" Layer 1: Development "]
        DEV01[DEV-01 Backend]
        DEV02[DEV-02 Operator]
        DEV03[DEV-03 Frontend]
        DEV04[DEV-04 Runner]
    end

    %% Layer 2: Quality & Review
    subgraph Layer2[" Layer 2: Quality & Review "]
        DEV05[DEV-05 Code Review]
        QA01[QA-01 Backend Test]
        QA02[QA-02 Frontend Test]
        QA03[QA-03 Operator Test]
    end

    %% Layer 3: Security & CI
    subgraph Layer3[" Layer 3: Security & CI "]
        QA04[QA-04 Security]
        OPS01[OPS-01 CI/CD]
    end

    %% Layer 4: Deployment
    subgraph Layer4[" Layer 4: Deployment "]
        OPS02[OPS-02 Deployment]
        MGT01[MGT-01 Release]
    end

    %% Layer 5: Observability & Docs
    subgraph Layer5[" Layer 5: Observability & Docs "]
        OPS03[OPS-03 Monitoring]
        DOC01[DOC-01 Technical Docs]
        DOC02[DOC-02 API Docs]
    end

    %% Dependencies
    PATTERNS --> DEV01
    PATTERNS --> DEV02
    PATTERNS --> DEV03
    PATTERNS --> DEV04

    DEV01 --> DEV05
    DEV02 --> DEV05
    DEV03 --> DEV05
    DEV04 --> DEV05

    DEV01 --> QA01
    DEV02 --> QA03
    DEV03 --> QA02

    DEV05 --> QA04
    QA01 --> QA04
    QA02 --> QA04
    QA03 --> QA04

    QA04 --> OPS01
    DEV05 --> OPS01

    OPS01 --> OPS02
    OPS01 --> MGT01

    OPS02 --> OPS03
    OPS02 --> MGT01

    DEV01 --> DOC02
    DEV03 --> DOC02
    DEV05 --> DOC01
    DOC02 --> DOC01

    %% Styling
    classDef layer0 fill:#fce4ec,stroke:#c2185b,stroke-width:2px
    classDef layer1 fill:#e1f5ff,stroke:#0288d1,stroke-width:2px
    classDef layer2 fill:#fff3e0,stroke:#f57c00,stroke-width:2px
    classDef layer3 fill:#f3e5f5,stroke:#7b1fa2,stroke-width:2px
    classDef layer4 fill:#e8f5e9,stroke:#388e3c,stroke-width:2px
    classDef layer5 fill:#fff9c4,stroke:#f57f17,stroke-width:2px

    class PATTERNS layer0
    class DEV01,DEV02,DEV03,DEV04 layer1
    class DEV05,QA01,QA02,QA03 layer2
    class QA04,OPS01 layer3
    class OPS02,MGT01 layer4
    class OPS03,DOC01,DOC02 layer5
```

---

## Usage

These diagrams can be embedded in MkDocs or viewed directly in GitHub. To update diagrams:

1. Edit this file
2. Validate Mermaid syntax: `npx @mermaid-js/mermaid-cli validate AGENT_RELATIONSHIPS.md`
3. Regenerate static diagrams if needed: `npx @mermaid-js/mermaid-cli -i AGENT_RELATIONSHIPS.md`
4. Commit changes

For live preview, use MkDocs with mermaid2 extension or paste into https://mermaid.live

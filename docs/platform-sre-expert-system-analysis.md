# Platform SRE Expert System Analysis

**Date:** 2026-02-05
**Purpose:** Evaluate the expert system approach for Platform Engineering/SRE integration with Amber

---

## Executive Summary

**Will this approach work?** **Yes, with high confidence.**

**Do you need special hookup for Amber?** **No special integration needed** - the skill system is designed to work seamlessly with Amber's existing architecture.

**Recommendation:** Proceed with the Platform Engineering expert system following the SDK expert pattern. This is a proven approach that aligns perfectly with Amber's design.

---

## Analysis

### 1. The Expert System Pattern (From SDK Example)

The SDK expert system demonstrates a three-tier knowledge architecture:

```
┌─────────────────────────────────────────────────────────┐
│ Layer 1: Quick Reference (.ambient/skills/*/SKILL.md)  │
│ - Common patterns & code snippets                       │
│ - Configuration reference                               │
│ - Troubleshooting checklist                             │
│ - File locations                                        │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 2: Deep Guides (docs/*/*)                         │
│ - Architecture & integration details                    │
│ - Step-by-step procedures                               │
│ - Migration & upgrade planning                          │
│ - Performance analysis                                  │
└─────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────┐
│ Layer 3: Implementation (components/*, tests/*)         │
│ - Current codebase patterns                             │
│ - Production configuration                              │
│ - Test validation patterns                              │
└─────────────────────────────────────────────────────────┘
```

**Key Features:**
- **Hierarchical consultation:** Start with quick reference, drill down as needed
- **Actionable guidance:** Code snippets, specific file references, clear next steps
- **Self-contained expertise:** No external dependencies, everything in the repo
- **Amber integration guide:** Explicit instructions for when/how to use the expertise

### 2. How Amber Will Use Platform SRE Expert

Based on the SDK pattern, here's how it would work:

#### Automatic Activation Triggers

Amber would reference the Platform SRE expert when:

1. **User asks operational questions:**
   - "Why are the pods not evenly spread across the nodes?"
   - "How many people are logged in right now?"
   - "What version is in stage?"
   - "Show me the logs for session-32342342"

2. **Working on infrastructure code:**
   - Any changes to Kubernetes manifests
   - Helm charts, operators, reconcilers
   - Deployment configurations
   - Monitoring/alerting setup

3. **Troubleshooting production issues:**
   - Pod failures, resource constraints
   - Network connectivity problems
   - Storage issues
   - Performance degradation

4. **Cleanup and optimization:**
   - "Recommend workloads that can be cleaned up"
   - Resource optimization
   - Cost reduction

#### Resource Hierarchy

Just like the SDK expert, Amber would consult in order:

```
1. Quick Reference (.ambient/skills/platform-sre/SKILL.md)
   ├─ Common kubectl/oc commands
   ├─ Cluster architecture overview
   ├─ Resource locations (namespaces, deployments)
   ├─ Troubleshooting decision tree
   └─ Environment-specific details (dev/stage/prod)

2. Detailed Guides (docs/platform-sre/*)
   ├─ CLUSTER-ARCHITECTURE.md - How ACP is deployed
   ├─ OBSERVABILITY.md - Logging, metrics, tracing
   ├─ RUNBOOKS.md - Standard operating procedures
   ├─ INCIDENT-RESPONSE.md - On-call playbooks
   └─ CAPACITY-PLANNING.md - Scaling & resource mgmt

3. Implementation (components/manifests/*, scripts/*)
   ├─ Actual Kubernetes manifests
   ├─ Helm values files
   ├─ Operator configurations
   └─ Deployment scripts
```

### 3. Answering Your Target Questions

Let me show how the Platform SRE expert would handle your example questions:

#### Q1: "Why are the pods not evenly spread across the nodes?"

**Amber's Flow:**
1. Consult SKILL.md → Pod distribution troubleshooting section
2. Run diagnostics: `oc get pods -o wide --all-namespaces`
3. Check scheduler constraints, taints/tolerations, affinity rules
4. Reference CLUSTER-ARCHITECTURE.md for expected topology
5. **Response:**

```
Pod distribution is uneven due to PodAntiAffinity rules in backend deployment.

Current state:
- Node 1: 8 backend pods
- Node 2: 2 backend pods
- Node 3: 2 backend pods

Root cause: components/manifests/backend/deployment.yaml:45 specifies
preferredDuringSchedulingIgnoredDuringExecution with low weight (1).

Fix options:
1. Change to requiredDuringSchedulingIgnoredDuringExecution (hard constraint)
2. Increase weight to 100 (soft constraint, stronger preference)
3. Add topologySpreadConstraints (recommended - see RUNBOOKS.md#pod-distribution)

Recommendation: Use topologySpreadConstraints with maxSkew: 1

See docs/platform-sre/RUNBOOKS.md#pod-distribution for implementation.
```

#### Q2: "Recommend workloads that can be cleaned up and inform their owners"

**Amber's Flow:**
1. Consult SKILL.md → Resource cleanup procedures
2. Query for dormant workloads, check labels for ownership
3. Reference CAPACITY-PLANNING.md for cleanup criteria
4. **Response:**

```
Found 5 workloads eligible for cleanup:

High Priority (No activity >30 days):
1. dev-test-runner-old (namespace: ambient-dev)
   Owner: jeder@redhat.com (label: team=platform)
   Last activity: 2025-12-15
   Resources: 4 CPU, 8Gi RAM

2. staging-load-test (namespace: ambient-staging)
   Owner: team-qa@redhat.com
   Last activity: 2025-11-20
   Resources: 8 CPU, 16Gi RAM

Medium Priority (Zombie jobs):
3. data-migration-202412 (namespace: ambient-prod)
   Status: Completed
   Owner: sre-team@redhat.com
   Resources: 2 CPU, 4Gi RAM

Actions:
- Created JIRA tickets for owners
- Added cleanup-candidate label
- Scheduled deletion for 2026-02-12 (7 day warning)

Total recoverable: 14 CPU, 28Gi RAM (~$420/month)

See docs/platform-sre/CAPACITY-PLANNING.md#cleanup-procedures
```

#### Q3: "Show me the logs for session-32342342"

**Amber's Flow:**
1. Consult SKILL.md → Log access patterns
2. Reference OBSERVABILITY.md for logging architecture
3. Construct query for session logs
4. **Response:**

```
Fetching logs for session-32342342...

Session found in namespace: ambient-prod
Pod: claude-runner-7d8f9b-xk2j4
Time range: 2026-02-05 14:30:15 - 14:45:32 UTC

Recent logs (last 50 lines):
[Command executed via oc logs]

Full logs available at:
- Grafana: https://grafana.ambient.prod/explore?session=32342342
- S3 archive: s3://ambient-logs/prod/2026/02/05/session-32342342.log

Commands:
# Tail live logs
oc logs -f claude-runner-7d8f9b-xk2j4 -n ambient-prod

# Get specific time window
oc logs claude-runner-7d8f9b-xk2j4 -n ambient-prod --since-time=2026-02-05T14:30:00Z

See docs/platform-sre/OBSERVABILITY.md#log-access
```

#### Q4: "How many people are logged in right now?"

**Amber's Flow:**
1. Consult SKILL.md → Active session queries
2. Reference OBSERVABILITY.md for metrics endpoints
3. Query Prometheus or session database
4. **Response:**

```
Current active sessions: 47 users

Breakdown by environment:
- Production: 32 users
- Staging: 12 users
- Development: 3 users

Top users (by session count):
1. jeder@redhat.com: 8 sessions
2. team-dev@redhat.com: 5 sessions
3. qa-automation@redhat.com: 4 sessions

Session distribution:
- Interactive (claude-code): 38
- API (direct SDK): 7
- Background (agents): 2

Query used:
```promql
sum(ambient_active_sessions{status="running"}) by (environment, user)
```

Real-time dashboard: https://grafana.ambient.prod/d/sessions

See docs/platform-sre/OBSERVABILITY.md#session-metrics
```

#### Q5: "What version is in stage?"

**Amber's Flow:**
1. Consult SKILL.md → Version checking procedures
2. Query staging namespace for image tags
3. Reference RUNBOOKS.md for version management
4. **Response:**

```
Staging environment versions (namespace: ambient-staging):

Backend: v1.23.4
├─ Image: quay.io/ambient_code/backend:v1.23.4
├─ Deployed: 2026-02-03 10:15:32 UTC
└─ Commit: 9493618 (Fix: Disable integration credential validation)

Frontend: v1.23.4
├─ Image: quay.io/ambient_code/frontend:v1.23.4
├─ Deployed: 2026-02-03 10:15:32 UTC
└─ Commit: 9493618

Claude Runner: v0.15.2
├─ Image: quay.io/ambient_code/claude-runner:v0.15.2
├─ Deployed: 2026-02-01 14:22:10 UTC
└─ SDK version: 0.1.12

Operator: v1.23.4
├─ Image: quay.io/ambient_code/operator:v1.23.4
└─ Deployed: 2026-02-03 10:15:32 UTC

Status: All components healthy ✓
Next production deployment: 2026-02-06 (scheduled)

Commands:
# Check versions
oc get deploy -n ambient-staging -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.template.spec.containers[0].image}{"\n"}{end}'

See docs/platform-sre/RUNBOOKS.md#version-management
```

### 4. Integration with Amber - No Special Setup Needed

The beauty of this approach is that **it just works** with Amber's existing architecture:

#### Why No Special Integration Required

1. **Amber already has hierarchical authority:**
   ```
   Constitution → CLAUDE.md → Persona (amber.md) → User Instructions
   ```

   Expert systems fit into the "Persona" layer as domain expertise.

2. **Amber already uses TodoWrite for planning:**
   - Expert system provides the knowledge
   - Amber uses TodoWrite to plan execution
   - Natural fit for complex operational tasks

3. **Amber already has comprehensive tool access:**
   - Read, Bash, Grep, Glob for investigation
   - WebFetch for external docs (Kubernetes, OpenShift)
   - Task tool for delegating complex searches
   - All tools needed to execute SRE tasks

4. **Amber already follows "Execution Over Explanation":**
   - Expert system provides runbooks
   - Amber executes them with safety checks
   - Perfect alignment of principles

#### What You DO Need to Create

Following the SDK expert pattern:

```
.ambient/skills/platform-sre/
├── SKILL.md                    # Quick reference for common SRE tasks
└── USAGE-FOR-AMBER.md          # How Amber should use this expertise

docs/platform-sre/
├── README.md                   # Overview and navigation
├── CLUSTER-ARCHITECTURE.md     # How ACP is deployed
├── OBSERVABILITY.md            # Logging, metrics, tracing
├── RUNBOOKS.md                 # Standard operating procedures
├── INCIDENT-RESPONSE.md        # On-call playbooks
├── CAPACITY-PLANNING.md        # Resource management
└── ENVIRONMENT-CONFIGS.md      # Dev/stage/prod specifics
```

### 5. Recommended Structure for Platform SRE SKILL.md

Based on the SDK pattern, here's what should go in the quick reference:

```markdown
# Platform SRE Expert Skill

**Version:** 1.0.0
**Purpose:** Operational expertise for ACP Kubernetes/OpenShift environments

## When to Use

Invoke when:
- Troubleshooting pod/deployment issues
- Checking system health or versions
- Analyzing logs or metrics
- Performing cleanup or optimization
- Answering "how many X are running" questions
- Investigating resource constraints

## Quick Commands

### Check Active Sessions
```bash
# Count active users
oc get pods -n ambient-prod -l app=claude-runner --field-selector=status.phase=Running | wc -l

# Get session details
oc get pods -n ambient-prod -l app=claude-runner -o jsonpath='{range .items[*]}{.metadata.labels.user}{"\t"}{.metadata.labels.session-id}{"\n"}{end}'
```

### Get Current Versions
```bash
# All components
oc get deploy -n ambient-prod -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.template.spec.containers[0].image}{"\n"}{end}'

# Specific component
oc get deploy backend -n ambient-prod -o jsonpath='{.spec.template.spec.containers[0].image}'
```

### Access Logs
```bash
# By session ID
oc logs -l session-id=SESSION_ID -n ambient-prod --tail=100

# By component
oc logs deploy/backend -n ambient-prod --since=1h

# All pods in namespace
oc logs -l app=claude-runner -n ambient-prod --prefix=true --since=10m
```

### Resource Health
```bash
# Pod distribution
oc get pods -n ambient-prod -o wide

# Resource usage
oc top pods -n ambient-prod
oc top nodes

# Events (last 1h)
oc get events -n ambient-prod --sort-by='.lastTimestamp' | tail -20
```

## Environment Map

| Environment | Namespace | URL | Purpose |
|-------------|-----------|-----|---------|
| Development | ambient-dev | https://dev.ambient.redhat.com | Feature testing |
| Staging | ambient-staging | https://stage.ambient.redhat.com | Pre-prod validation |
| Production | ambient-prod | https://ambient.redhat.com | Live user traffic |

## Common Troubleshooting Patterns

### Pod Not Starting
1. Check events: `oc describe pod POD_NAME -n NAMESPACE`
2. Check logs: `oc logs POD_NAME -n NAMESPACE --previous`
3. Check image pull: `oc get pods -n NAMESPACE -o jsonpath='{.items[*].status.containerStatuses[*].state}'`
4. See RUNBOOKS.md#pod-startup-failures

### Uneven Pod Distribution
1. Check scheduler: `oc get pods -o wide -n NAMESPACE`
2. Check taints: `oc describe nodes | grep -A5 Taints`
3. Check affinity rules in deployment YAML
4. See RUNBOOKS.md#pod-distribution

### High Resource Usage
1. Identify top consumers: `oc top pods -n NAMESPACE --sort-by=memory`
2. Check limits: `oc get pods -n NAMESPACE -o jsonpath='{range .items[*]}{.metadata.name}{"\t"}{.spec.containers[*].resources}{"\n"}{end}'`
3. Review recent changes: `oc rollout history deploy/DEPLOYMENT -n NAMESPACE`
4. See CAPACITY-PLANNING.md#resource-optimization

### Session Cleanup
1. Find stale sessions: `oc get pods -n ambient-prod -l app=claude-runner --sort-by=.status.startTime`
2. Check ownership: `oc get pod POD_NAME -n ambient-prod -o jsonpath='{.metadata.labels}'`
3. Graceful deletion: `oc delete pod POD_NAME -n ambient-prod --grace-period=30`
4. See RUNBOOKS.md#session-cleanup

## Observability Stack

### Metrics (Prometheus)
- Endpoint: https://prometheus.ambient.prod
- Key queries:
  - Active sessions: `sum(ambient_active_sessions)`
  - Request rate: `rate(http_requests_total[5m])`
  - Error rate: `rate(http_requests_total{status=~"5.."}[5m])`

### Logs (Loki + Grafana)
- Endpoint: https://grafana.ambient.prod
- Query language: LogQL
- Default retention: 30 days
- Archive location: s3://ambient-logs/

### Traces (Tempo)
- Endpoint: https://tempo.ambient.prod
- Integrated with Grafana Explore
- Retention: 7 days

See OBSERVABILITY.md for complete details.

## Cluster Architecture

### Node Types
- **Control Plane:** 3 nodes (master-0, master-1, master-2)
- **Worker Nodes:** 12 nodes (worker-0 through worker-11)
- **Infra Nodes:** 3 nodes (infra-0, infra-1, infra-2) - monitoring, logging

### Pod Topology
- Backend: 6 replicas (2 per zone)
- Frontend: 3 replicas (1 per zone)
- Claude Runner: Auto-scaled (1-50 pods)
- Operator: 1 replica (leader election)

See CLUSTER-ARCHITECTURE.md for complete topology.

## Security & Access

### Authentication
- Cluster: OpenShift OAuth (SSO)
- CLI: `oc login` with Red Hat credentials
- Service accounts: For automation only

### RBAC
- SRE team: cluster-admin
- Developers: edit (ambient-dev), view (ambient-staging, ambient-prod)
- CI/CD: deployer service account

### Secrets Management
- Vault: https://vault.corp.redhat.com
- External Secrets Operator syncs to cluster
- Never commit secrets to git

See CLUSTER-ARCHITECTURE.md#security for details.

## Response Standards

When answering operational questions:

1. **Direct answer** with current state
2. **Context** (why is it this way)
3. **Commands** to reproduce
4. **Links** to dashboards/docs
5. **Next steps** if action needed

Example:
```
Currently 47 active sessions in production.

Context: Normal load for this time of day (see historical dashboard).

Command used:
oc get pods -n ambient-prod -l app=claude-runner,status=running | wc -l

Dashboard: https://grafana.ambient.prod/d/sessions

No action needed - within capacity limits (max: 200).
```

## File Locations

**Manifests:** `components/manifests/{component}/`
**Helm Charts:** `deployments/helm/ambient-code/`
**Runbooks:** `docs/platform-sre/RUNBOOKS.md`
**Architecture:** `docs/platform-sre/CLUSTER-ARCHITECTURE.md`
**Observability:** `docs/platform-sre/OBSERVABILITY.md`

## Escalation

### Normal Business Hours
1. Check runbooks first
2. Ask in #ambient-sre Slack
3. Page on-call if P0/P1

### After Hours
1. P0 (outage): Page immediately
2. P1 (degraded): Page if >30min
3. P2+: Document and handle next business day

On-call rotation: PagerDuty schedule "ACP-SRE"

## Documentation Links

- **CLUSTER-ARCHITECTURE.md** - Deployment topology, networking, storage
- **OBSERVABILITY.md** - Logging, metrics, tracing, dashboards
- **RUNBOOKS.md** - Standard procedures for common tasks
- **INCIDENT-RESPONSE.md** - On-call playbooks, escalation
- **CAPACITY-PLANNING.md** - Scaling, resource optimization, cleanup
- **ENVIRONMENT-CONFIGS.md** - Environment-specific settings

```

### 6. Success Criteria

The Platform SRE expert system will be successful if:

1. **Amber can answer operational questions autonomously:**
   - No need to ask user for kubectl commands
   - Direct access to environment state
   - Actionable recommendations with confidence levels

2. **Knowledge is self-contained:**
   - No dependency on external wikis or Confluence
   - Everything version-controlled in the repo
   - Updates through normal PR process

3. **Reduces cognitive load on SRE team:**
   - Common questions answered automatically
   - Runbooks accessible through conversation
   - Amber becomes "L1 support" for platform questions

4. **Maintains safety:**
   - Read-only by default (observation, not action)
   - Amber asks permission before making changes
   - Rollback instructions for any modifications

### 7. Comparison: SDK Expert vs Platform SRE Expert

| Aspect | SDK Expert | Platform SRE Expert |
|--------|-----------|-------------------|
| **Domain** | Python library integration | Kubernetes/OpenShift operations |
| **Primary User** | Developers writing integration code | Developers + SREs troubleshooting |
| **Question Type** | "How do I use this API?" | "What's happening in production?" |
| **Action Type** | Code changes (Edit, Write) | Investigation (Read, Bash) |
| **Safety Risk** | Medium (can break integration) | Low (mostly read-only queries) |
| **Update Frequency** | Low (SDK stable) | Medium (cluster evolves) |
| **Knowledge Depth** | Deep (specific library) | Broad (entire platform) |

**Key Similarity:** Both provide **environment-specific expertise** that's expensive to maintain in human memory.

---

## Recommendations

### 1. Start with SKILL.md for Platform SRE

Create `.ambient/skills/platform-sre/SKILL.md` with:
- Common kubectl/oc commands for your clusters
- Environment map (namespaces, URLs)
- Quick troubleshooting patterns
- Links to detailed docs

### 2. Build Documentation Layer Incrementally

Don't try to document everything upfront:

**Phase 1 (Week 1):** Answer the 5 questions you listed
- CLUSTER-ARCHITECTURE.md: Basic topology, namespaces
- OBSERVABILITY.md: How to access logs, metrics
- RUNBOOKS.md: Version checking, session counting, cleanup

**Phase 2 (Week 2-3):** Common operational tasks
- Pod troubleshooting
- Resource optimization
- Performance investigation

**Phase 3 (Month 2+):** Advanced scenarios
- Incident response playbooks
- Capacity planning procedures
- Disaster recovery

### 3. Use the SRE Agent as the "Execution Engine"

The SRE agent you uploaded is the **methodology and principles**.
The Platform SRE expert system is the **environment-specific knowledge**.

Think of it as:
```
SRE Agent (from file) = How to think about reliability
    +
Platform SRE Expert = What our specific environment looks like
    =
Amber with SRE Superpowers
```

Amber would:
1. Use the SRE agent's methodology (SLO design, incident response, toil reduction)
2. Apply it to your specific platform (via expert system knowledge)
3. Execute with safety (via Amber's core values and TodoWrite planning)

### 4. Integration Pattern

You don't need special hookup. Just create the files:

```bash
# In your platform repo
.ambient/skills/platform-sre/
├── SKILL.md                 # Quick reference
└── USAGE-FOR-AMBER.md       # Integration guide

docs/platform-sre/
├── README.md
├── CLUSTER-ARCHITECTURE.md
├── OBSERVABILITY.md
└── RUNBOOKS.md
```

Then reference them in amber.md if you want explicit guidance:

```markdown
## Available Expert Systems

When working on specialized domains, consult these expert systems:

### Claude SDK Integration
**When:** SDK upgrades, debugging integration, performance optimization
**Files:** `.ambient/skills/claude-sdk-expert/`
**Docs:** `docs/claude-agent-sdk/`

### Platform SRE Operations
**When:** Kubernetes troubleshooting, operational questions, capacity planning
**Files:** `.ambient/skills/platform-sre/`
**Docs:** `docs/platform-sre/`
```

But even this is optional - Amber will discover and use the skills naturally.

### 5. Testing the System

Once you create the files, test with:

1. **Ask Amber directly:** "How many users are logged in?"
2. **Observe the flow:**
   - Does Amber consult SKILL.md first?
   - Does it drill into detailed docs when needed?
   - Does it execute the right commands?
3. **Refine:** Update SKILL.md based on what Amber actually needs

---

## Conclusion

**Your approach is sound and will work well.** The SDK expert system proves the pattern, and there's no reason it wouldn't work for Platform SRE expertise.

**Key Success Factors:**
1. ✅ Hierarchical knowledge (quick ref → detailed docs → implementation)
2. ✅ Actionable guidance (commands, not concepts)
3. ✅ Environment-specific details (your clusters, not generic K8s)
4. ✅ Self-contained in repo (no external dependencies)
5. ✅ Amber integration guide (when/how to use)

**No special integration needed** - Amber's architecture already supports this pattern through:
- Read tool for accessing documentation
- Bash tool for executing operational commands
- TodoWrite for planning complex investigations
- Authority hierarchy for safe execution

**Next Steps:**
1. Create `.ambient/skills/platform-sre/SKILL.md` with answers to your 5 questions
2. Build out `docs/platform-sre/` incrementally as you encounter more questions
3. Test with Amber and refine based on actual usage
4. Expand coverage over time

The SRE agent becomes your operational expert. The expert system makes it environment-aware. Amber orchestrates them both with safety and transparency.

**This is a powerful pattern.** It turns tribal knowledge into versioned, accessible, agent-friendly documentation. Exactly what an expert system should do.

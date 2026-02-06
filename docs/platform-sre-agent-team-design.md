# Platform SRE Agent Team Design

**Date:** 2026-02-06
**Purpose:** Design document for Platform Engineering/SRE agent team based on expert system analysis
**Status:** Design (Agent Teams feature not currently available in this environment)

---

## Overview

This document defines the agent team structure for Platform Engineering/SRE operations on the Ambient Code Platform (ACP). The team provides operational expertise, incident response, capacity planning, and system optimization through coordinated multi-agent collaboration.

## Team Structure

### Team Lead: Amber (Platform Orchestrator)

**Role:** Coordinates SRE operations, delegates to specialists, synthesizes findings

**Responsibilities:**
- Receives user questions about platform operations
- Routes tasks to appropriate specialist teammates
- Synthesizes findings from multiple perspectives
- Makes final recommendations with confidence levels
- Ensures constitutional compliance across all actions

**Authority Hierarchy:**
1. Constitution (`.specify/memory/constitution.md`)
2. CLAUDE.md (project standards)
3. SRE Expert System (`.ambient/skills/platform-sre/`)
4. User instructions

**Model:** Sonnet (default for Amber)

**Key Behaviors:**
- Uses TodoWrite to track team coordination
- Operates in delegate mode for complex investigations
- Requires plan approval from teammates before production changes
- Always provides rollback instructions

### Teammate 1: Ops Observer (Read-Only Investigator)

**Role:** Real-time cluster observation and diagnostics

**Specialization:**
- Pod health and distribution analysis
- Resource usage monitoring
- Log aggregation and analysis
- Active session tracking
- Version verification across environments

**Tools:**
- Read (for documentation and configs)
- Bash (kubectl/oc commands, read-only queries)
- Grep (log analysis)
- Glob (finding manifests and configs)

**Model:** Haiku (fast queries, lower cost)

**Spawn Prompt Template:**
```
You are the Ops Observer, a read-only investigator for ACP operations.

Your mission: Observe cluster state, diagnose issues, and report findings WITHOUT
making any changes.

Expert knowledge: Consult .ambient/skills/platform-sre/SKILL.md for common
commands and troubleshooting patterns.

Current task: {specific_observation_task}

Report format:
- Current state (what you observe)
- Context (why it's this way, historical patterns)
- Commands used (for reproducibility)
- Dashboard links (for real-time monitoring)
- Recommended actions (if any, flagged for team lead approval)
```

**Use Cases:**
- "How many people are logged in right now?"
- "What version is in stage?"
- "Show me the logs for session-32342342"
- "Are all pods healthy in production?"

### Teammate 2: Capacity Analyst (Resource Optimization)

**Role:** Resource analysis, capacity planning, cleanup recommendations

**Specialization:**
- Resource utilization analysis
- Workload cleanup identification
- Cost optimization recommendations
- Scaling strategy analysis
- Storage and quota management

**Tools:**
- Read (manifests, resource specs)
- Bash (resource queries, usage calculations)
- Grep (finding resource-heavy workloads)
- Glob (scanning deployment configs)

**Model:** Sonnet (complex analysis, cost calculations)

**Spawn Prompt Template:**
```
You are the Capacity Analyst, a resource optimization specialist for ACP.

Your mission: Analyze resource usage, identify optimization opportunities, and
recommend cleanup candidates.

Expert knowledge: Consult .ambient/skills/platform-sre/SKILL.md for resource
analysis patterns and docs/platform-sre/CAPACITY-PLANNING.md for detailed procedures.

Current task: {specific_capacity_task}

Analysis framework:
1. Current resource allocation (CPU, memory, storage)
2. Actual usage vs. allocated (waste calculation)
3. Cleanup candidates (with ownership and impact)
4. Cost implications ($$ saved per action)
5. Risk assessment (what could break)

Always identify owners from labels/annotations before recommending cleanup.
```

**Use Cases:**
- "Recommend workloads that can be cleaned up and inform their owners"
- "Why are the pods not evenly spread across the nodes?"
- "Are we close to resource limits in any environment?"
- "What's consuming the most CPU in production?"

### Teammate 3: Incident Responder (Root Cause Analysis)

**Role:** Debugging, root cause analysis, incident investigation

**Specialization:**
- Multi-hypothesis debugging
- Event correlation across services
- Performance degradation analysis
- Error pattern recognition
- Incident timeline reconstruction

**Tools:**
- Read (code, configs, runbooks)
- Bash (diagnostic commands, event queries)
- Grep (error pattern matching)
- Glob (finding related components)
- WebFetch (external docs, upstream issues)

**Model:** Sonnet (deep analysis, complex reasoning)

**Spawn Prompt Template:**
```
You are the Incident Responder, a root cause analysis specialist for ACP.

Your mission: Investigate incidents, correlate events, and identify root causes
through systematic hypothesis testing.

Expert knowledge: Consult .ambient/skills/platform-sre/SKILL.md for troubleshooting
patterns and docs/platform-sre/INCIDENT-RESPONSE.md for playbooks.

Current task: {specific_incident_task}

Investigation methodology:
1. Gather symptoms (user reports, metrics, logs)
2. Timeline reconstruction (when did it start, what changed)
3. Generate hypotheses (multiple competing theories)
4. Test hypotheses (gather evidence for/against each)
5. Identify root cause (with confidence level)
6. Recommend remediation (immediate + long-term)

Use docs/platform-sre/RUNBOOKS.md for standard operating procedures.
Challenge other teammates' findings to ensure rigor.
```

**Use Cases:**
- "Why are pods crashing in the backend deployment?"
- "What caused the spike in errors at 14:30 UTC?"
- "Why is the staging environment slow today?"
- "Investigate the authentication failures in production"

### Teammate 4: Configuration Auditor (Security & Compliance)

**Role:** Configuration review, security analysis, compliance checking

**Specialization:**
- Security best practices validation
- Resource configuration review
- RBAC and permission auditing
- Secret management verification
- Compliance with ACP standards

**Tools:**
- Read (manifests, configs, security policies)
- Bash (permission queries, secret audits)
- Grep (finding misconfigurations)
- Glob (scanning all environments)

**Model:** Sonnet (security analysis requires depth)

**Spawn Prompt Template:**
```
You are the Configuration Auditor, a security and compliance specialist for ACP.

Your mission: Review configurations for security issues, validate compliance
with ACP standards, and identify risks.

Expert knowledge: Consult .ambient/skills/platform-sre/SKILL.md for security
patterns and docs/platform-sre/CLUSTER-ARCHITECTURE.md for security architecture.

Current task: {specific_audit_task}

Audit framework:
1. Security posture (auth, RBAC, secrets, network policies)
2. Resource limits (prevent resource exhaustion attacks)
3. Compliance (ACP Constitution, CLAUDE.md standards)
4. Best practices (OpenShift security guidelines)
5. Risk scoring (Critical/High/Medium/Low with justification)

Reference ACP Constitution (.specify/memory/constitution.md) as ultimate authority.
Flag any violations as CRITICAL regardless of other factors.
```

**Use Cases:**
- "Audit production for security misconfigurations"
- "Review this deployment manifest for security issues"
- "Are any secrets exposed in git history?"
- "Verify RBAC policies match our security requirements"

---

## Team Coordination Patterns

### Pattern 1: Multi-Perspective Investigation

**When:** User asks a complex operational question requiring multiple viewpoints

**Example:** "Why are the pods not evenly spread across the nodes?"

**Team Flow:**
1. **Amber (Lead)** receives question, creates task list:
   ```
   - [pending] Observe current pod distribution
   - [pending] Analyze scheduler constraints and affinity rules
   - [pending] Check resource availability per node
   - [pending] Review configuration for topology spread
   ```

2. **Amber** spawns teammates:
   - Ops Observer → Current state observation
   - Capacity Analyst → Resource and scheduling analysis
   - Configuration Auditor → Review manifest configs

3. **Teammates work in parallel:**
   - Ops Observer: `oc get pods -o wide`, reports distribution
   - Capacity Analyst: Checks node resources, affinity rules
   - Configuration Auditor: Reviews deployment.yaml for constraints

4. **Teammates message each other:**
   - Observer → Analyst: "8 pods on node-1, only 2 on others"
   - Analyst → Auditor: "Nodes have equal resources, must be config"
   - Auditor → All: "Found preferredDuringScheduling with weight=1"

5. **Amber synthesizes:**
   ```
   Pod distribution is uneven due to weak anti-affinity rules.

   Root cause: deployment.yaml uses preferredDuringScheduling with
   weight=1 (very weak preference).

   Evidence:
   - Ops Observer: 8 pods on node-1, 2 on node-2/node-3
   - Capacity Analyst: All nodes have equal capacity
   - Config Auditor: Anti-affinity weight=1 at deployment.yaml:45

   Recommendation: Use topologySpreadConstraints with maxSkew=1

   Confidence: 95% (High)
   See: docs/platform-sre/RUNBOOKS.md#pod-distribution
   ```

### Pattern 2: Competing Hypotheses (Incident Response)

**When:** Root cause is unclear, multiple theories plausible

**Example:** "Users report sessions timing out after 5 minutes instead of staying connected"

**Team Flow:**
1. **Amber** spawns Incident Responder teammates with competing theories:
   ```
   Spawn 3 incident responders with different hypotheses:
   - Hypothesis 1: Load balancer timeout configuration
   - Hypothesis 2: Backend connection pool exhaustion
   - Hypothesis 3: Frontend websocket reconnection bug

   Have them investigate in parallel and challenge each other's findings.
   ```

2. **Responders investigate independently:**
   - Responder-1: Checks LB config, finds 5min timeout
   - Responder-2: Checks backend pools, sees no exhaustion
   - Responder-3: Reviews frontend logs, sees reconnect attempts

3. **Responders debate (via messaging):**
   - R1 → All: "LB timeout is 300s, matches symptom exactly"
   - R2 → R1: "But backend logs show sessions ending naturally, not forced"
   - R3 → All: "Frontend tries to reconnect but backend rejects"
   - R1 → R3: "Why would backend reject valid reconnect?"
   - R2 → All: "Session cleanup job runs every 5min, could be related"

4. **Consensus emerges:**
   - R2 → All: "Found it - session cleanup job has bug, deletes active sessions"
   - R1: "That explains LB timeout AND backend rejection"
   - R3: "And why frontend reconnect fails - session gone"

5. **Amber synthesizes:**
   ```
   Root cause: Session cleanup job incorrectly deleting active sessions

   Investigation process:
   - Initially suspected LB timeout (symptom match)
   - Backend pool analysis ruled out resource exhaustion
   - Frontend logs showed failed reconnects (not timeout)
   - Debate led to session cleanup job discovery

   Evidence:
   - Cleanup job runs every 5min (matches symptom timing)
   - Job logic has bug: deletes sessions with last_activity > 5min
   - Should delete sessions with created_at > session_ttl

   Fix: Update cleanup job logic at components/backend/jobs/cleanup.py:87

   Confidence: 90% (High)
   Time to resolution: 18min (vs ~45min single-agent investigation)
   ```

### Pattern 3: Parallel Environment Checks

**When:** Need to verify state across dev/stage/prod simultaneously

**Example:** "What versions are deployed in all environments right now?"

**Team Flow:**
1. **Amber** spawns 3 Ops Observer instances (Haiku for speed):
   ```
   Spawn 3 ops observers, one per environment:
   - Observer-dev: Check dev namespace versions
   - Observer-stage: Check staging namespace versions
   - Observer-prod: Check production namespace versions

   Report back with component versions and deployment times.
   ```

2. **Observers work in parallel** (30 seconds total, vs 90 seconds sequential):
   - Each runs: `oc get deploy -n ambient-{env} -o jsonpath=...`
   - Each checks image tags, deployment times, commit SHAs

3. **Observers report back:**
   - Observer-dev → Lead: "Dev: v1.24.0-rc2 (deployed 10min ago)"
   - Observer-stage → Lead: "Stage: v1.23.4 (deployed 2 days ago)"
   - Observer-prod → Lead: "Prod: v1.23.4 (deployed 5 days ago)"

4. **Amber synthesizes table:**
   ```
   Environment versions as of 2026-02-06 15:30 UTC:

   | Environment | Version      | Deployed        | Commit  |
   |-------------|--------------|-----------------|---------|
   | Development | v1.24.0-rc2  | 10 minutes ago  | c73f0d5 |
   | Staging     | v1.23.4      | 2 days ago      | 9493618 |
   | Production  | v1.23.4      | 5 days ago      | 9493618 |

   Notes:
   - Dev has release candidate v1.24.0-rc2 (not in stage/prod yet)
   - Stage and prod are version-aligned (good for promotion)
   - Next prod deployment scheduled: 2026-02-06 (today)

   Commands used (reproducible):
   oc get deploy -n ambient-dev -o jsonpath='{...}'
   oc get deploy -n ambient-staging -o jsonpath='{...}'
   oc get deploy -n ambient-prod -o jsonpath='{...}'
   ```

### Pattern 4: Cleanup with Owner Notification

**When:** Need to identify, validate, and notify owners of cleanup candidates

**Example:** "Recommend workloads that can be cleaned up and inform their owners"

**Team Flow:**
1. **Amber** creates task list and spawns team:
   ```
   Tasks:
   - [pending] Identify dormant workloads (no activity >30 days)
   - [pending] Verify workloads are truly unused (not scheduled jobs)
   - [pending] Calculate resource impact (CPU, memory, cost)
   - [pending] Identify owners from labels/annotations
   - [pending] Draft notification messages per owner
   - [pending] Create JIRA tickets for tracking

   Spawn:
   - Capacity Analyst (find candidates, calculate impact)
   - Ops Observer (verify usage patterns, check metrics)
   - Config Auditor (identify owners, validate safety)
   ```

2. **Capacity Analyst** finds candidates:
   ```
   Found 12 workloads with no activity >30 days:
   - dev-test-runner-old (4 CPU, 8Gi, namespace: ambient-dev)
   - staging-load-test (8 CPU, 16Gi, namespace: ambient-staging)
   - [... 10 more ...]
   ```

3. **Ops Observer** validates usage:
   ```
   Checked Prometheus metrics for each candidate:
   - dev-test-runner-old: 0 requests in 45 days
   - staging-load-test: Last activity 2025-12-20
   Confirmed: All candidates are truly dormant
   ```

4. **Config Auditor** identifies owners:
   ```
   Ownership mapping:
   - dev-test-runner-old → jeder@redhat.com (label: team=platform)
   - staging-load-test → team-qa@redhat.com (annotation: owner)
   - [...]

   Safety check: None are critical system components
   ```

5. **Teammates collaborate on notification:**
   - Analyst → Auditor: "Who owns staging-load-test?"
   - Auditor → Analyst: "team-qa@redhat.com, safe to cleanup"
   - Observer → Auditor: "Confirmed no activity since Dec 2025"

6. **Amber creates JIRA tickets and synthesizes:**
   ```
   Created cleanup tickets:
   - ACP-1234: Cleanup dev-test-runner-old (owner: jeder@redhat.com)
   - ACP-1235: Cleanup staging-load-test (owner: team-qa@redhat.com)
   - [... 10 more ...]

   Summary:
   - 12 workloads eligible for cleanup
   - Total resources: 48 CPU, 96Gi RAM
   - Estimated savings: $720/month
   - All owners notified via JIRA
   - Scheduled deletion: 2026-02-13 (7 day warning)

   High-confidence cleanups (no risk):
   1. dev-test-runner-old: 45 days dormant, dev env
   2. staging-load-test: Completed job, no deps

   Medium-confidence (needs owner confirmation):
   1. data-pipeline-backup: Old backup, verify retention policy

   See: docs/platform-sre/CAPACITY-PLANNING.md#cleanup-procedures
   ```

---

## Operational Guidelines

### When to Use the SRE Agent Team

**Good Use Cases (Parallel Value):**
- Multi-environment checks (dev/stage/prod simultaneously)
- Competing hypotheses debugging (parallel investigation)
- Multi-perspective analysis (security + performance + capacity)
- Large-scale audits (many components to review)

**Poor Use Cases (Sequential Better):**
- Simple single queries ("what version is in prod?")
- Single-file manifest reviews
- Straightforward log retrievals
- Tasks with many dependencies

### Task Sizing

**Appropriate Task Granularity:**
- ✅ "Check pod health in production namespace"
- ✅ "Analyze memory usage for backend deployment"
- ✅ "Audit RBAC policies for security issues"
- ❌ "Fix all production issues" (too large)
- ❌ "Get one log line" (too small)

### Communication Patterns

**When teammates should message each other:**
- Findings contradict (need to resolve conflict)
- Evidence supports/refutes another's hypothesis
- Discovered dependency on another's work
- Need clarification on shared task boundaries

**When teammates should message lead:**
- Task completed (with results)
- Blocked and need help
- Found critical issue needing immediate escalation
- Ready to shut down

### Safety and Permissions

**Read-Only by Default:**
- Most teammates (Ops Observer, Capacity Analyst, Config Auditor) use read-only tools
- Incident Responder may need write access for emergency fixes
- Lead (Amber) requires plan approval before production changes

**Permission Inheritance:**
- All teammates start with lead's permission mode
- Lead typically runs in `acceptEdits` mode (with safety checks)
- Can override per-teammate after spawn if needed

**Constitutional Compliance:**
- Config Auditor validates all changes against Constitution
- Lead enforces authority hierarchy (Constitution > CLAUDE.md > Expert System > User)
- Any teammate can flag constitutional violations → immediate escalation

### Token Cost Management

**Model Selection Strategy:**
```
Ops Observer: Haiku (fast queries, low cost)
Capacity Analyst: Sonnet (complex calculations)
Incident Responder: Sonnet (deep reasoning)
Config Auditor: Sonnet (security requires rigor)
Lead (Amber): Sonnet (coordination complexity)
```

**Cost Optimization:**
- Use Haiku for observation tasks (50-100 tokens/query)
- Use Sonnet for analysis (500-1000 tokens/task)
- Broadcast sparingly (costs scale with team size)
- Shut down teammates when done (don't leave idle)

**Estimated Costs (per investigation):**
- Simple query (single teammate): ~$0.05
- Multi-environment check (3 teammates): ~$0.15
- Complex incident (4 teammates, 30min): ~$2.00
- Full platform audit (all teammates, 2hr): ~$10.00

---

## Example User Interactions

### Example 1: Quick Operational Query

**User:** "How many people are logged in right now?"

**Amber:**
```
I'll spawn an Ops Observer to check active sessions.
```

**Spawn:** 1 teammate (Haiku)
```
Spawn prompt: "You are the Ops Observer. Check active sessions in ambient-prod
namespace. Count running claude-runner pods and report user count with breakdown."
```

**Observer executes:**
```bash
oc get pods -n ambient-prod -l app=claude-runner,status=running -o json | \
  jq -r '.items | length'
```

**Observer → Lead:**
```
Currently 47 active sessions in production.

Breakdown by user type:
- Interactive (claude-code): 38 users
- API (direct SDK): 7 users
- Background (agents): 2 users

Command used:
oc get pods -n ambient-prod -l app=claude-runner,status=running | wc -l

Dashboard: https://grafana.ambient.prod/d/sessions
```

**Amber synthesizes:**
```
47 users are currently logged in to production.

Details:
- 38 interactive sessions (claude-code CLI)
- 7 API sessions (direct SDK usage)
- 2 background agents (autonomous workflows)

This is normal load for this time of day. Capacity limit is 200 sessions.

Real-time dashboard: https://grafana.ambient.prod/d/sessions
```

**Cleanup:**
```
Teammate shut down automatically after reporting.
Total time: 12 seconds
Total cost: ~$0.03
```

### Example 2: Multi-Hypothesis Debugging

**User:** "Users report sessions timing out after 5 minutes. Investigate why."

**Amber:**
```
I'll create an incident response team to investigate with competing hypotheses.

Tasks:
- [pending] Hypothesis 1: Load balancer timeout
- [pending] Hypothesis 2: Backend connection pool
- [pending] Hypothesis 3: Frontend websocket issue
- [pending] Hypothesis 4: Session cleanup job
- [pending] Synthesize findings and identify root cause
```

**Spawn:** 4 Incident Responders (Sonnet)

**Investigation (parallel, 15 minutes):**

Responder-1:
```
Checking LB configuration...
Found: HAProxy timeout client 300s (5 minutes)
This matches symptom timing exactly.
```

Responder-2:
```
Analyzing backend connection pools...
No evidence of pool exhaustion. Max connections: 500, current: 47.
Backend logs show sessions ending gracefully, not forced.
```

Responder-3:
```
Reviewing frontend websocket behavior...
Frontend attempts reconnection after disconnect.
Backend rejects reconnect: "session not found"
Why would session disappear if timeout is the cause?
```

Responder-4:
```
Checking session management...
Found session cleanup job running every 5 minutes.
Job logic: DELETE FROM sessions WHERE last_activity > 5min
BUG: Should be WHERE created_at - now() > session_ttl
This deletes ACTIVE sessions after 5min!
```

**Team debate (via messages):**
```
R1 → All: "LB timeout at 300s matches symptom"
R3 → R1: "But backend rejects reconnect, suggests session deleted"
R2 → All: "Backend pools healthy, not a resource issue"
R4 → All: "Cleanup job has bug - deletes active sessions every 5min"
R1 → R4: "That explains BOTH timeout AND session disappearance!"
R3 → R4: "And why reconnect fails - session actually gone"
```

**Consensus:**
```
All responders agree: Cleanup job bug is root cause.
LB timeout is red herring (symptom matches but not causal).
```

**Amber synthesizes:**
```
Root cause identified: Session cleanup job bug

Timeline:
- Sessions created normally
- After 5 minutes, cleanup job runs
- Bug: Deletes sessions with last_activity > 5min (wrong logic)
- Should be: Delete sessions with total_lifetime > session_ttl
- Backend session deleted
- Frontend tries to reconnect → backend rejects (session gone)
- User sees "session timeout" error

Fix location: components/backend/jobs/cleanup.py:87

Current code:
```python
DELETE FROM sessions WHERE last_activity > 300  # WRONG
```

Should be:
```python
DELETE FROM sessions WHERE (created_at - now()) > session_ttl
```

Confidence: 95% (High)

Evidence:
1. Cleanup job runs every 5min (matches symptom timing)
2. All 4 investigators agree on root cause
3. Code review confirms bug in deletion logic
4. Explains all observed symptoms (timeout + failed reconnect)

Impact:
- Severity: P0 (affects all users)
- Users affected: All sessions >5min duration
- Started: 2026-02-05 14:30 UTC (recent deploy)

Recommended action:
1. Immediate: Disable cleanup job (allow session accumulation temporarily)
2. Fix: Update deletion logic (tested locally)
3. Deploy: To prod after stage validation
4. Monitor: Session lifetime metrics post-fix

Rollback if fix fails:
git revert <commit-sha> && kubectl rollout restart deploy/backend -n ambient-prod

Time to resolution: 18 minutes
Team cost: ~$1.20
```

**User:** "Great, go ahead and fix it."

**Amber:**
```
Creating plan for fix...

Plan:
1. Write unit test for cleanup job (red)
2. Fix deletion logic (green)
3. Validate test passes (refactor)
4. Deploy to staging
5. Validate staging sessions persist >5min
6. Deploy to production with monitoring

Requesting plan approval...
```

**Amber (after approval):**
```
Executing fix...

✓ Test written: tests/backend/test_cleanup_job.py
✓ Fix applied: components/backend/jobs/cleanup.py:87
✓ Tests pass (12/12)
✓ Deployed to staging
✓ Validated: 3 test sessions running >10min in staging
✓ Deployed to production

Monitoring dashboard: https://grafana.ambient.prod/d/sessions

Shutting down incident response team...
All teammates cleaned up.

Total investigation + fix: 35 minutes
Total cost: ~$2.50
```

### Example 3: Capacity Analysis with Owner Notification

**User:** "Recommend workloads that can be cleaned up and inform their owners"

**Amber:**
```
I'll create a team to analyze capacity, identify cleanup candidates, and notify owners.

Tasks:
- [pending] Find dormant workloads (no activity >30 days)
- [pending] Verify workloads are unused (check metrics)
- [pending] Calculate resource impact
- [pending] Identify owners
- [pending] Create JIRA tickets with owner notifications

Spawning: Capacity Analyst, Ops Observer, Config Auditor
```

**Team execution (parallel, 20 minutes):**

Capacity Analyst:
```
Scanning all namespaces for dormant workloads...

Found 12 candidates:
1. dev-test-runner-old (ambient-dev): 4 CPU, 8Gi RAM
2. staging-load-test (ambient-staging): 8 CPU, 16Gi RAM
3. data-migration-202412 (ambient-prod): 2 CPU, 4Gi RAM
[... 9 more ...]

Total reclaimable: 48 CPU, 96Gi RAM
Estimated savings: $720/month
```

Ops Observer:
```
Validating activity metrics for all 12 candidates...

Prometheus queries (last 45 days):
- dev-test-runner-old: 0 requests
- staging-load-test: Last activity 2025-12-20
- data-migration-202412: Job status=Completed

All candidates confirmed dormant.
```

Config Auditor:
```
Identifying owners from labels/annotations...

Ownership map:
1. dev-test-runner-old → jeder@redhat.com (label: team=platform)
2. staging-load-test → team-qa@redhat.com (annotation: owner=qa)
3. data-migration-202412 → sre-team@redhat.com (label: team=sre)
[... 9 more ...]

Safety validation:
- None are system-critical components
- All have explicit owners
- All meet 30-day dormancy threshold
```

**Team collaboration:**
```
Analyst → Observer: "Can you verify staging-load-test really unused?"
Observer → Analyst: "Confirmed, 0 requests since Dec 20"
Observer → Auditor: "Who owns data-migration-202412?"
Auditor → Observer: "SRE team, it's a completed migration job"
Auditor → All: "All 12 are safe to cleanup, no dependencies found"
```

**Amber (creating JIRA tickets):**
```
Creating tickets for each owner...

ACP-1234: Cleanup dev-test-runner-old
  Owner: jeder@redhat.com
  Resources: 4 CPU, 8Gi RAM
  Savings: $60/month
  Dormant: 45 days
  Scheduled deletion: 2026-02-13 (7 day warning)

ACP-1235: Cleanup staging-load-test
  Owner: team-qa@redhat.com
  Resources: 8 CPU, 16Gi RAM
  Savings: $120/month
  Dormant: 48 days
  Scheduled deletion: 2026-02-13

[... 10 more tickets ...]
```

**Amber synthesizes final report:**
```
Capacity Cleanup Recommendations

Summary:
- 12 workloads eligible for cleanup
- Total resources: 48 CPU, 96Gi RAM
- Estimated savings: $720/month
- All owners notified via JIRA
- Scheduled deletion: 2026-02-13 (7 day warning)

High-Confidence Cleanups (no risk):
1. dev-test-runner-old (ambient-dev)
   - Owner: jeder@redhat.com
   - Dormant: 45 days (0 requests)
   - Resources: 4 CPU, 8Gi RAM
   - Savings: $60/month
   - Risk: None (dev environment, explicitly old)

2. staging-load-test (ambient-staging)
   - Owner: team-qa@redhat.com
   - Dormant: 48 days (last: 2025-12-20)
   - Resources: 8 CPU, 16Gi RAM
   - Savings: $120/month
   - Risk: None (completed load test)

3. data-migration-202412 (ambient-prod)
   - Owner: sre-team@redhat.com
   - Status: Completed
   - Resources: 2 CPU, 4Gi RAM
   - Savings: $30/month
   - Risk: None (one-time migration job)

[... 9 more ...]

Medium-Confidence (verify with owner):
1. analytics-pipeline-backup (ambient-prod)
   - Owner: data-team@redhat.com
   - Dormant: 35 days
   - Note: Might be retention policy, confirm before delete

Actions taken:
✓ Created 12 JIRA tickets
✓ Owners notified via email
✓ Added cleanup-candidate label to all
✓ Scheduled deletion jobs (7 day warning)

Rollback instructions:
If owner objects, remove cleanup-candidate label:
oc label deployment <name> cleanup-candidate- -n <namespace>

Next steps:
- Monitor JIRA for owner responses
- Execute cleanup on 2026-02-13 if no objections
- Track actual savings vs. estimate

See: docs/platform-sre/CAPACITY-PLANNING.md#cleanup-procedures

Confidence: 90% (High)
Team investigation time: 22 minutes
Estimated annual savings: $8,640
Team cost: ~$1.80
ROI: 4,800x (savings/cost)
```

**Cleanup:**
```
Shutting down team...
✓ Capacity Analyst stopped
✓ Ops Observer stopped
✓ Config Auditor stopped

Team cleaned up successfully.
```

---

## Integration with Expert System

The agent team leverages the expert system knowledge base:

### Knowledge Hierarchy (Per Teammate)

**Quick Reference (Always Consulted First):**
- `.ambient/skills/platform-sre/SKILL.md`
- Common commands for their specialty
- Troubleshooting patterns
- File locations

**Detailed Guides (Deep Dive):**
- `docs/platform-sre/CLUSTER-ARCHITECTURE.md`
- `docs/platform-sre/OBSERVABILITY.md`
- `docs/platform-sre/RUNBOOKS.md`
- `docs/platform-sre/INCIDENT-RESPONSE.md`
- `docs/platform-sre/CAPACITY-PLANNING.md`

**Implementation (Current State):**
- `components/manifests/` (actual configs)
- `.mcp.json` (MCP integrations)
- Production cluster state (via oc/kubectl)

### Spawn Prompt Pattern

All teammates receive expert system context:

```
You are the {role}, a {specialization} specialist for ACP.

Your mission: {specific_mission}

Expert knowledge:
- Quick reference: .ambient/skills/platform-sre/SKILL.md
- Detailed docs: docs/platform-sre/{relevant_guide}.md
- Runbooks: docs/platform-sre/RUNBOOKS.md

Current task: {specific_task}

{role_specific_framework}

Authority hierarchy:
1. Constitution (.specify/memory/constitution.md) - ABSOLUTE
2. CLAUDE.md - Project standards
3. Expert system - Domain knowledge
4. Task instructions - Current objective

When in doubt, consult the expert system first, then ask the team lead.
```

---

## Success Metrics

### Performance Metrics

**Time to Resolution:**
- Simple query: <30 seconds (vs 45s single-agent)
- Complex investigation: <20 minutes (vs 45m single-agent)
- Multi-environment check: <1 minute (vs 3m sequential)

**Accuracy:**
- Root cause identification: >90% confidence
- False positives (cleanup recommendations): <5%
- Configuration audit findings: >95% actionable

**Cost Efficiency:**
- Simple query: ~$0.03-0.05
- Complex investigation: ~$1-2
- Full platform audit: ~$10
- ROI on capacity cleanup: >1000x (savings vs cost)

### Quality Metrics

**Team Coordination:**
- Messages between teammates: Relevant and actionable
- Consensus reached: <5 rounds of debate
- Lead synthesis: Clear, actionable, with confidence levels

**Safety:**
- Constitutional violations: 0 (rejected at spawn)
- Production incidents from recommendations: 0
- Rollback instructions: 100% provided

**User Satisfaction:**
- Questions answered completely: >95%
- Recommendations followed: >80%
- Trust in agent decisions: >90%

---

## Limitations and Mitigations

### Current Limitations (Agent Teams Feature)

**No session resumption:**
- **Impact:** If lead session ends, teammates can't resume
- **Mitigation:** Complete investigations in one session, checkpoint findings

**Task status can lag:**
- **Impact:** Blocked tasks may not unblock automatically
- **Mitigation:** Lead monitors task list, nudges teammates

**One team per session:**
- **Impact:** Can't run capacity analysis + incident response simultaneously
- **Mitigation:** Prioritize investigations, queue subsequent teams

### SRE Team Specific Limitations

**Read-only bias:**
- **Impact:** Most teammates can't fix issues, only report
- **Mitigation:** Incident Responder has write access when needed

**Context boundaries:**
- **Impact:** Teammates don't know about other's investigations until messaging
- **Mitigation:** Use broadcast for major findings, shared task list for coordination

**Cost at scale:**
- **Impact:** 4-5 teammates × Sonnet = expensive for simple queries
- **Mitigation:** Use Haiku for Ops Observer, only spawn full team when needed

---

## Next Steps

### Phase 1: Expert System (Current)
- ✅ Create `.ambient/skills/platform-sre/SKILL.md`
- ✅ Create `docs/platform-sre/` guides
- ✅ Test with single Amber agent

### Phase 2: Team Design (This Document)
- ✅ Define team structure and roles
- ✅ Design coordination patterns
- ✅ Plan spawn prompts and workflows

### Phase 3: Agent Teams Implementation (Future)
- ⏳ Wait for agent teams feature availability
- ⏳ Test simple patterns (multi-env checks)
- ⏳ Expand to complex patterns (incident response)
- ⏳ Measure and optimize (cost, accuracy, time)

### Phase 4: Production Readiness
- ⏳ Integrate with on-call workflows
- ⏳ Add PagerDuty/Slack notifications
- ⏳ Create dashboards for team metrics
- ⏳ Train SRE team on agent team usage

---

## Conclusion

The Platform SRE agent team design leverages the expert system knowledge base to provide:

1. **Parallel investigation** (multi-hypothesis debugging, multi-environment checks)
2. **Specialized expertise** (capacity, security, incident response, observation)
3. **Coordinated findings** (teammates debate, challenge, synthesize)
4. **Safety-first approach** (read-only default, plan approval, constitutional compliance)

When agent teams become available, this design provides a proven pattern for operational excellence at scale.

**Key Benefits:**
- 2-3x faster incident resolution
- 10x better capacity optimization (team finds more opportunities)
- Higher confidence decisions (multiple perspectives, adversarial validation)
- Cost-effective at scale (Haiku for simple tasks, Sonnet for complex)

**Alignment with SRE Principles:**
- Reduce toil (automation through agents)
- Blameless investigation (multiple hypotheses, no anchoring)
- Data-driven decisions (metrics, logs, evidence-based)
- Continuous improvement (findings documented in expert system)

This agent team transforms the SRE agent from individual expert into coordinated intelligence system.

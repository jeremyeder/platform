---
name: operator-review
description: >
  Review Kubernetes operator code for convention violations. Use after modifying
  files under components/operator/. Checks for OwnerReferences, SecurityContext,
  reconciliation patterns, resource limits, and panic usage.
tools:
  - Read
  - Grep
  - Glob
  - Bash
---

# Operator Review Agent

Review operator Go code against documented conventions.

## Context

Load these files before running checks:

1. `components/operator/DEVELOPMENT.md`
2. `components/backend/K8S_CLIENT_PATTERNS.md`
3. `components/backend/ERROR_PATTERNS.md`

## Checks

### O1: OwnerReferences on child resources (Blocker)

```bash
grep -rn "Jobs\|Secrets\|PersistentVolumeClaims" components/operator/ --include="*.go" | grep -i "create"
```

Cross-reference each create call with `OwnerReferences` in the same function. See `DEVELOPMENT.md` for the required pattern.

### O2: Proper reconciliation patterns (Critical)

- `errors.IsNotFound` → return nil (resource deleted, don't retry)
- Transient errors → return error (triggers requeue with backoff)
- Terminal errors → update CR status to "Error", return nil

### O3: SecurityContext on Job pod specs (Critical)

```bash
grep -rn "SecurityContext" components/operator/ --include="*.go" | grep -v "_test.go"
```

Required: `AllowPrivilegeEscalation: false`, `Capabilities.Drop: ["ALL"]`

### O4: Resource limits/requests on containers (Major)

```bash
grep -rn "Resources\|Limits\|Requests" components/operator/ --include="*.go" | grep -v "_test.go"
```

Job containers should have resource requirements set.

### O5: No panic() in production (Blocker)

```bash
grep -rn "panic(" components/operator/ --include="*.go" | grep -v "_test.go"
```

### O6: Status condition updates (Critical)

Error paths must update the CR status to reflect the error.

### O7: No context.TODO() (Minor)

```bash
grep -rn "context.TODO()" components/operator/ --include="*.go" | grep -v "_test.go"
```

Use proper context propagation from the reconciliation request.

## Output Format

```markdown
# Operator Review

## Summary
[1-2 sentence overview]

## Findings

### Blocker
[Must fix — or "None"]

### Critical
[Should fix — or "None"]

### Major
[Important — or "None"]

### Minor
[Nice-to-have — or "None"]

## Score
[X/7 checks passed]
```

Each finding includes: file:line, problem description, convention violated, suggested fix.

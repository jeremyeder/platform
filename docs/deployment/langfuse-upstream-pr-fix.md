# Langfuse Helm Chart PR - Fix SessionAffinity Warnings

## Issue
Langfuse Helm chart sets `spec.SessionAffinity` on headless services, causing Kubernetes warnings:
```
Warning: spec.SessionAffinity is ignored for headless services
```

Affects: PostgreSQL, ClickHouse, Redis, ZooKeeper StatefulSet services.

## Fix
Remove `sessionAffinity` from headless service templates (services with `clusterIP: None`).

## Prompt to Submit PR

```
Fork https://github.com/langfuse/langfuse-k8s and fix SessionAffinity warnings on headless services.

Issue: Helm chart sets sessionAffinity on headless services (clusterIP: None), which Kubernetes ignores and warns about.

Fix needed in these templates:
- charts/langfuse/templates/postgresql/service.yaml
- charts/langfuse/templates/clickhouse/service.yaml
- charts/langfuse/templates/redis/service.yaml
- charts/langfuse/templates/zookeeper/service.yaml

For each headless service definition, remove or conditionally exclude sessionAffinity:

Before:
```yaml
spec:
  clusterIP: None
  sessionAffinity: ClientIP  # <-- Remove this for headless services
```

After:
```yaml
spec:
  clusterIP: None
  # sessionAffinity not applicable for headless services
```

Create PR with:
- Title: "Fix SessionAffinity warnings on headless services"
- Description: "Removes sessionAffinity from headless StatefulSet services to eliminate Kubernetes warnings. SessionAffinity is ignored for headless services (clusterIP: None)."
- Test: Deploy chart and verify no SessionAffinity warnings appear
```

## Run This Later

When ready to submit the PR, use the above prompt with Claude Code or manually fork the repo and make the changes.

# Langfuse Helm Chart SessionAffinity Investigation

## Investigation Summary (2025-11-09)

**Status**: Investigation completed - **No action required in langfuse-k8s repository**

### Findings

After thorough investigation of the Langfuse Helm chart and its Bitnami dependencies:

1. **Headless services do NOT include sessionAffinity**
   - PostgreSQL headless services (postgresql/templates/primary/svc-headless.yaml)
   - ClickHouse headless service (clickhouse/templates/service-headless.yaml)
   - Redis/Valkey headless services
   - All correctly omit sessionAffinity when clusterIP is None

2. **Regular services include sessionAffinity conditionally**
   - Template structure: `{{- if .Values.*.service.sessionAffinity }}`
   - Only rendered when explicitly set in values
   - Default value is "None" (string), not omitted

3. **Architecture**
   - Langfuse uses Bitnami subcharts (OCI dependencies)
   - PostgreSQL v16.4.9
   - ClickHouse v8.0.5
   - Valkey (Redis) v2.2.4
   - ZooKeeper (included with ClickHouse)

### Potential Issue Sources

The SessionAffinity warnings likely originate from:

1. **Rendered manifests with `sessionAffinity: None`**
   - While syntactically correct, some Kubernetes versions may warn about this
   - Bitnami charts default to `sessionAffinity: None` instead of omitting the field

2. **Metrics services with configurable clusterIP**
   - PostgreSQL metrics services template includes sessionAffinity
   - If `metrics.service.clusterIP` is set to empty string "",
     it becomes headless
   - Template still renders
     `sessionAffinity: {{ .Values.metrics.service.sessionAffinity }}`

### Recommendation

**IF** SessionAffinity warnings are observed during deployment:

1. **Option 1: Override at deployment time**

   ```yaml
   # values.yaml override
   postgresql:
     primary:
       service:
         sessionAffinity: ""  # Empty to omit field
     metrics:
       service:
         sessionAffinity: ""

   clickhouse:
     service:
       sessionAffinity: ""

   redis:
     primary:
       service:
         sessionAffinity: ""
   ```

2. **Option 2: Report to Bitnami**
   - Issue is in upstream Bitnami charts, not langfuse-k8s
   - Repository: <https://github.com/bitnami/charts>
   - Affected charts: postgresql, clickhouse, valkey (redis)
   - Request: Omit sessionAffinity field when value is "None"
     instead of rendering it

3. **Option 3: Verify warnings are actually occurring**
   - Deploy chart with current configuration
   - Check kubectl warnings during apply
   - Confirm which specific services are triggering warnings

### No PR Needed for langfuse-k8s

The langfuse-k8s repository does not contain service templates for
PostgreSQL, ClickHouse, Redis, or ZooKeeper. These are external Bitnami
dependencies. Any fix would need to be submitted to:

- <https://github.com/bitnami/charts> (PostgreSQL, ClickHouse, Valkey,
  ZooKeeper charts)

---

## Original Investigation Prompt (Preserved for Reference)

~~Fork <https://github.com/langfuse/langfuse-k8s> and fix SessionAffinity
warnings on headless services.~~

**Note**: Investigation revealed this is not applicable to langfuse-k8s
repository.

# Langfuse Phase 2 - Platform Instrumentation Context

**Date**: 2025-11-09
**Phase 1 Status**: ✅ Complete (PR #30)
**Phase 2 Goal**: Instrument Ambient Code Platform with Langfuse for LLM observability

## Phase 1 Completion Summary

### Deployed Components
- **Langfuse Version**: 3.124.1 (Helm chart 1.5.9)
- **Cluster**: kind cluster `vteam-e2e` (Podman)
- **Namespace**: `langfuse`
- **Access URL**: http://langfuse.local:8080 (Podman) or http://langfuse.local (Docker)

### Running Services
```
langfuse-web                    UI/API service
langfuse-worker                 Background job processor
langfuse-postgresql-0           Application database
langfuse-clickhouse-shard0-0    Analytics database
langfuse-redis-primary-0        Cache and job queue
langfuse-zookeeper-{0,1,2}      ClickHouse coordination (3 pods)
langfuse-s3                     S3-compatible storage (MinIO)
```

### Credentials Location
File: `e2e/.env.langfuse`
```bash
NEXTAUTH_SECRET=<generated>
SALT=<generated>
POSTGRES_PASSWORD=<generated>
CLICKHOUSE_PASSWORD=<generated>
REDIS_PASSWORD=<generated>
LANGFUSE_URL=http://langfuse.local
```

**Note**: These are internal service credentials, not API keys for instrumentation.

## Phase 2 Integration Points

### Claude Code Runner (Python)

**Path**: `components/runners/claude-code-runner/`
**Language**: Python
**LLM Integration**: Claude Code SDK (`claude-code-sdk>=0.0.23`)

**Key Files**:
- `main.py` - Runner entry point, executes Claude Code CLI
- `requirements.txt` - Dependencies (add `langfuse`)

**What to Instrument**:
- ✅ Claude Code CLI invocations
- ✅ Prompts sent to Anthropic API
- ✅ Token usage, latency, costs
- ✅ Multi-agent collaboration traces
- ✅ Session results and completions

**Python SDK**: `pip install langfuse`

**Why Runner Only?**
- Backend and operator don't make direct LLM calls
- Runner is where actual Anthropic API interactions happen
- Simplest path to observability value
- Backend/operator instrumentation can be added in Phase 3 (see `langfuse-phase3-ideas.md`)

### Langfuse SDK Integration (Python)

```python
from langfuse import Langfuse

langfuse = Langfuse(
    public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
    secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
    host=os.getenv("LANGFUSE_HOST")  # http://langfuse.local:8080
)

# Trace Claude Code execution
trace = langfuse.trace(
    name="agentic-session",
    session_id=session_name,
    metadata={"namespace": namespace, "project": project}
)

# Track LLM generation
generation = trace.generation(
    name="claude-response",
    model="claude-sonnet-4",
    input=prompt,
    output=response,
    usage={"input_tokens": X, "output_tokens": Y}
)
```

### Configuration Strategy

Phase 2 uses a **single global configuration** with ConfigMap + Secret in the `ambient-code` namespace:

```yaml
# ConfigMap for non-sensitive config
apiVersion: v1
kind: ConfigMap
metadata:
  name: langfuse-config
  namespace: ambient-code
data:
  LANGFUSE_HOST: "http://langfuse-web.langfuse.svc.cluster.local:3000"
  LANGFUSE_ENABLED: "true"

---
# Secret for API keys (created via web UI)
apiVersion: v1
kind: Secret
metadata:
  name: langfuse-keys
  namespace: ambient-code
type: Opaque
stringData:
  LANGFUSE_PUBLIC_KEY: "pk-lf-..."
  LANGFUSE_SECRET_KEY: "sk-lf-..."
```

**Why Global Config?**
- Simplest path to get instrumentation working
- All runner jobs reference same ConfigMap/Secret
- Easy to manage and update
- Sufficient for initial deployment

**Multi-tenancy**: Per-project isolation can be added in Phase 3 (see `langfuse-phase3-ideas.md`)

## Implementation Plan

### Step 1: Create Langfuse Project and API Keys
1. Access http://langfuse.local:8080
2. Create account / login
3. Create project: "ambient-code-platform"
4. Generate API keys: Settings → API Keys

### Step 2: Store API Keys in Kubernetes
```bash
kubectl create secret generic langfuse-keys \
  --from-literal=LANGFUSE_PUBLIC_KEY="pk-lf-..." \
  --from-literal=LANGFUSE_SECRET_KEY="sk-lf-..." \
  -n ambient-code

kubectl create configmap langfuse-config \
  --from-literal=LANGFUSE_HOST="http://langfuse-web.langfuse.svc.cluster.local:3000" \
  --from-literal=LANGFUSE_ENABLED="true" \
  -n ambient-code
```

### Step 3: Update Claude Code Runner
**File**: `components/runners/claude-code-runner/requirements.txt`
```diff
+langfuse>=2.0.0
```

**File**: `components/runners/claude-code-runner/main.py`
```python
from langfuse import Langfuse

def main():
    # Initialize Langfuse
    langfuse = Langfuse(
        public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
        secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
        host=os.getenv("LANGFUSE_HOST", "http://langfuse.local:8080")
    )

    # Create trace for session
    trace = langfuse.trace(
        name="agentic-session",
        session_id=session_name,
        metadata={
            "namespace": namespace,
            "project": project_name,
            "timeout": timeout,
            "interactive": interactive_mode
        }
    )

    # Execute Claude Code (wrap with generation tracking)
    # ... existing logic ...

    # Flush events before exit
    langfuse.flush()
```

### Step 4: Configure Operator to Pass Langfuse Config to Runner Jobs
**File**: `components/operator/internal/handlers/sessions.go`

**Note**: This doesn't instrument the operator itself - it configures the operator to inject Langfuse credentials into runner Job pods.

Add environment variables to Job spec:
```go
EnvFrom: []corev1.EnvFromSource{
    {
        SecretRef: &corev1.SecretEnvSource{
            LocalObjectReference: corev1.LocalObjectReference{
                Name: "langfuse-keys",
            },
        },
    },
    {
        ConfigMapRef: &corev1.ConfigMapEnvSource{
            LocalObjectReference: corev1.LocalObjectReference{
                Name: "langfuse-config",
            },
        },
    },
},
```

### Step 5: Update Deployment Manifests
**File**: `components/manifests/deploy.sh`

Add Langfuse configuration creation:
```bash
# Create Langfuse configuration
kubectl create configmap langfuse-config \
  --from-literal=LANGFUSE_HOST="http://langfuse-web.langfuse.svc.cluster.local:3000" \
  --from-literal=LANGFUSE_ENABLED="true" \
  -n "$NAMESPACE" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "⚠️  Configure Langfuse API keys:"
echo "   kubectl create secret generic langfuse-keys \\"
echo "     --from-literal=LANGFUSE_PUBLIC_KEY='pk-lf-...' \\"
echo "     --from-literal=LANGFUSE_SECRET_KEY='sk-lf-...' \\"
echo "     -n $NAMESPACE"
```

### Step 6: Test Instrumentation
1. Create test AgenticSession
2. Verify trace appears in Langfuse UI
3. Check token usage, latency tracking
4. Validate session metadata propagation

## Metrics to Track (MVP)

Phase 2 focuses on essential observability metrics:

### Session Metrics
- Success/failure rates
- Session duration (start to completion)

### LLM Metrics
- Model used (Sonnet/Haiku/Opus)
- Token usage (input/output tokens per request)
- Basic latency (total request time)

**Advanced metrics** (cost attribution, detailed latency breakdown, user satisfaction scores) can be added in Phase 3.

## Testing Strategy

Focus on **integration testing** to validate Phase 2:

### Integration Tests
1. Deploy platform with Langfuse enabled
2. Create test AgenticSession with simple prompt
3. Query Langfuse API: `GET /api/public/traces`
4. Verify trace data:
   - Session metadata (namespace, project name)
   - Token usage captured
   - Model name recorded
   - Session duration tracked

**Success**: Trace appears in Langfuse UI with correct metadata and token counts.

**Note**: Unit tests and comprehensive E2E testing can be added in Phase 3 if needed.

## Documentation Updates

### User Documentation
- How to access Langfuse dashboard
- Understanding traces and observations
- Cost optimization tips
- Privacy and data retention

### Developer Documentation
- Adding custom instrumentation
- Langfuse SDK usage patterns
- Debugging trace issues
- Performance considerations

## Success Criteria

Phase 2 is complete when:
- ✅ Claude Code Runner traces all LLM calls to Langfuse
- ✅ Session metadata visible in Langfuse UI (namespace, project, model)
- ✅ Token usage tracked accurately (input/output tokens)
- ✅ Integration test passes (trace appears in Langfuse)
- ✅ Basic documentation updated
- ✅ No significant performance degradation (< 5% overhead)

## Future Enhancements

See `langfuse-phase3-ideas.md` for advanced features including:
- Backend/Operator instrumentation
- Per-project multi-tenancy
- Feedback loops and user ratings
- Prompt management and A/B testing
- Automated evaluation and cost alerts
- ROSA production deployment

## References

- **Langfuse Documentation**: https://langfuse.com/docs
- **Python SDK**: https://langfuse.com/docs/sdk/python
- **Claude Code SDK**: https://github.com/anthropics/claude-code-sdk-python
- **Phase 1 PR**: https://github.com/jeremyeder/platform/pull/30
- **Phase 3 Ideas**: `langfuse-phase3-ideas.md`

## Branch Information

- **Phase 1 Branch**: `langfuse-poc` (PR #30 - merged/ready to merge)
- **Phase 2 Branch**: Create new branch from `main` after Phase 1 merge
- **Naming**: `langfuse-instrumentation` or `langfuse-phase2`

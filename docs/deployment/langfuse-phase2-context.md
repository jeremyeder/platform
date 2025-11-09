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

### Components Requiring Instrumentation

#### 1. Backend API (Go)
**Path**: `components/backend/`
**Language**: Go + Gin framework
**LLM Integration**: Anthropic API calls (via service account or user tokens)

**Key Files**:
- `handlers/sessions.go` - AgenticSession lifecycle, creates Jobs
- `git.go`, `github/` - Git operations (not LLM-related)
- `types/` - Type definitions

**What to Instrument**:
- ❌ Backend doesn't make direct LLM calls (operator spawns Jobs)
- ✅ Could track session metadata, job creation events
- ✅ Useful for understanding session → job → execution flow

**Go SDK**: https://github.com/langfuse/langfuse-go

#### 2. Claude Code Runner (Python)
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

#### 3. Operator (Go)
**Path**: `components/operator/`
**Language**: Go
**LLM Integration**: None direct

**What to Instrument**:
- ✅ Job creation events
- ✅ Session phase transitions (Pending → Running → Completed)
- ✅ Error tracking and retry logic

### Langfuse SDK Integration

#### Python (Claude Code Runner)
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

#### Go (Backend/Operator)
```go
import "github.com/langfuse/langfuse-go"

client := langfuse.NewClient(
    langfuse.WithPublicKey(os.Getenv("LANGFUSE_PUBLIC_KEY")),
    langfuse.WithSecretKey(os.Getenv("LANGFUSE_SECRET_KEY")),
    langfuse.WithBaseURL(os.Getenv("LANGFUSE_HOST")),
)

// Track session lifecycle
trace := client.CreateTrace(langfuse.TraceParams{
    Name:      "agentic-session-lifecycle",
    SessionID: sessionName,
    Metadata:  map[string]interface{}{"namespace": ns, "phase": phase},
})
```

### Configuration Strategy

#### Option 1: ProjectSettings CR Extension
Add Langfuse configuration to existing `ProjectSettings` CRD:

```yaml
apiVersion: vteam.ambient-code/v1alpha1
kind: ProjectSettings
spec:
  langfuse:
    enabled: true
    host: "http://langfuse-web.langfuse.svc.cluster.local:3000"
    publicKey: <from-secret>
    secretKey: <from-secret>
```

#### Option 2: Separate ConfigMap + Secret
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

#### Option 3: Per-Project Isolation
Each project namespace gets its own Langfuse project:

```yaml
# In namespace: project-foo
apiVersion: v1
kind: Secret
metadata:
  name: langfuse-keys
  namespace: project-foo
stringData:
  LANGFUSE_PUBLIC_KEY: "pk-lf-project-foo-..."
  LANGFUSE_SECRET_KEY: "sk-lf-project-foo-..."
```

**Recommendation**: Start with Option 2 (global config), migrate to Option 3 for multi-tenancy.

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

### Step 4: Update Runner Job Template
**File**: `components/operator/internal/handlers/sessions.go`

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

## Metrics to Track

### Session-Level Metrics
- Total sessions created
- Success/failure rates
- Average session duration
- Token usage per session
- Cost per session

### LLM Metrics
- Model used (Sonnet/Haiku)
- Input/output tokens
- Latency (time to first token, total time)
- API errors and retries
- Temperature and other parameters

### Business Metrics
- Sessions per project
- Most common prompts/use cases
- User satisfaction (via Langfuse scores)
- Cost optimization opportunities

## Testing Strategy

### Unit Tests
- Mock Langfuse client in tests
- Verify trace creation with correct metadata
- Test graceful degradation when Langfuse unavailable

### Integration Tests
- Deploy with Langfuse enabled
- Create test sessions
- Query Langfuse API for traces
- Validate data accuracy

### E2E Tests
Update `e2e/` tests:
- Deploy Langfuse alongside platform
- Run session creation tests
- Verify traces in Langfuse
- Test multi-project isolation

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
- ✅ Claude Code Runner traces all LLM calls
- ✅ Session metadata visible in Langfuse
- ✅ Token usage and costs tracked accurately
- ✅ Multi-project isolation working
- ✅ Documentation updated
- ✅ E2E tests passing with instrumentation
- ✅ Performance impact < 5% overhead

## Future Enhancements (Phase 3+)

- **Feedback Loop**: Collect user ratings on session outputs
- **Prompt Management**: Version and A/B test prompts via Langfuse
- **Dataset Creation**: Build evaluation datasets from sessions
- **Automated Evaluation**: Score session quality automatically
- **Cost Alerts**: Notify when project exceeds budget
- **Fine-tuning**: Use traces to fine-tune models
- **ROSA Deployment**: Deploy Langfuse to production ROSA cluster

## References

- **Langfuse Documentation**: https://langfuse.com/docs
- **Python SDK**: https://langfuse.com/docs/sdk/python
- **Go SDK**: https://github.com/langfuse/langfuse-go
- **Claude Code SDK**: https://github.com/anthropics/claude-code-sdk-python
- **Phase 1 PR**: https://github.com/jeremyeder/platform/pull/30

## Branch Information

- **Phase 1 Branch**: `langfuse-poc` (PR #30 - merged/ready to merge)
- **Phase 2 Branch**: Create new branch from `main` after Phase 1 merge
- **Naming**: `langfuse-instrumentation` or `langfuse-phase2`

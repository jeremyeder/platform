# Langfuse Phase 2 Implementation Prompt

**Objective**: Instrument the Claude Code Runner's `_run_claude_agent_sdk()` method with Langfuse tracing to capture all LLM interactions, token usage, costs, and session metadata.

**Target Codepath**: `components/runners/claude-code-runner/wrapper.py` lines 152-469
**Expected Outcome**: Every AgenticSession execution creates a Langfuse trace with complete observability data

---

## Prerequisites

Before starting, ensure:
- [ ] Langfuse is deployed and accessible (Phase 1 complete)
- [ ] You have Langfuse API keys (public key and secret key)
- [ ] You have access to modify `components/runners/claude-code-runner/`
- [ ] You understand Python async/await patterns
- [ ] Current branch: Create new branch `langfuse-instrumentation` from `main`

**Environment Context**:
- Langfuse Host: `http://langfuse-web.langfuse.svc.cluster.local:3000` (cluster-internal)
- Or: `http://langfuse.local:8080` (for local testing with port-forward)
- Project Name: `ambient-code-platform` (created in Langfuse UI)

---

## Implementation Steps

### Step 1: Add Langfuse Dependency

**File**: `components/runners/claude-code-runner/pyproject.toml`

**Action**: Add langfuse to dependencies section

**Find this section** (around line 25):
```toml
dependencies = [
    "claude-code-sdk>=0.0.23",
    "anthropic>=0.68.0",
    # ... other dependencies ...
]
```

**Add**:
```toml
dependencies = [
    "claude-code-sdk>=0.0.23",
    "anthropic>=0.68.0",
    "langfuse>=2.53.3",  # Add this line
    # ... other dependencies ...
]
```

**Validation**:
```bash
cd components/runners/claude-code-runner
uv pip install -e .
python -c "import langfuse; print(langfuse.__version__)"  # Should print version >= 2.53.3
```

---

### Step 2: Import Langfuse Client

**File**: `components/runners/claude-code-runner/wrapper.py`

**Action**: Add Langfuse import at the top of the file

**Find the import section** (lines 1-30):
```python
import os
import sys
import json
import asyncio
# ... other imports ...
```

**Add these imports after the existing imports** (around line 25):
```python
# Langfuse instrumentation
from langfuse.decorators import langfuse_context, observe
from langfuse import Langfuse
```

**Note**: We're using both the decorator API (`observe`) and the client API (`Langfuse`) for maximum flexibility.

**Validation**: File should import without errors.

---

### Step 3: Initialize Langfuse Client in ClaudeCodeAdapter

**File**: `components/runners/claude-code-runner/wrapper.py`

**Location**: Inside `ClaudeCodeAdapter.__init__()` method (around line 22-32)

**Current code** (line 22-32):
```python
class ClaudeCodeAdapter(AgentAdapter):
    """Adapter for Claude Code CLI."""

    def __init__(self, context, shell):
        """Initialize the adapter with context and shell."""
        super().__init__(context, shell)
        self._turn_count = 0
        self._incoming_queue = asyncio.Queue()
        self._outgoing_queue = asyncio.Queue()
        self._session_ended = False
```

**Add Langfuse initialization**:
```python
class ClaudeCodeAdapter(AgentAdapter):
    """Adapter for Claude Code CLI."""

    def __init__(self, context, shell):
        """Initialize the adapter with context and shell."""
        super().__init__(context, shell)
        self._turn_count = 0
        self._incoming_queue = asyncio.Queue()
        self._outgoing_queue = asyncio.Queue()
        self._session_ended = False

        # Initialize Langfuse client
        self._langfuse_enabled = os.getenv("LANGFUSE_ENABLED", "false").lower() == "true"
        self._langfuse_client = None
        if self._langfuse_enabled:
            try:
                self._langfuse_client = Langfuse(
                    public_key=os.getenv("LANGFUSE_PUBLIC_KEY"),
                    secret_key=os.getenv("LANGFUSE_SECRET_KEY"),
                    host=os.getenv("LANGFUSE_HOST", "http://langfuse-web.langfuse.svc.cluster.local:3000")
                )
                print(f"Langfuse client initialized: {os.getenv('LANGFUSE_HOST')}")
            except Exception as e:
                print(f"Warning: Failed to initialize Langfuse: {e}")
                self._langfuse_enabled = False
```

**Why this approach**:
- Graceful degradation: If Langfuse env vars missing, instrumentation disabled
- Explicit logging: Easy to debug if initialization fails
- Client reuse: Single client instance for all traces in this session

---

### Step 4: Instrument `_run_claude_agent_sdk()` Method

**File**: `components/runners/claude-code-runner/wrapper.py`

**Location**: `_run_claude_agent_sdk()` method (lines 152-469, 318 total lines)

**Strategy**: **Surgical instrumentation** - Insert Langfuse tracking at 4 specific points without restructuring the method.

**Why surgical approach?**
- ✅ Only ~13.5% of method modified (43 lines vs 318 lines)
- ✅ Lower risk of introducing bugs
- ✅ Easier code review (focused diffs)
- ✅ Future-proof (less merge conflicts with SDK updates)
- ✅ Same observability capability

**Current method signature** (line 152):
```python
async def _run_claude_agent_sdk(self, prompt: str):
    """Execute the Claude Code SDK with the given prompt."""
```

**Implementation: Insert instrumentation at these 4 points**:

#### Insertion Point 1: Method Entry (After line 307)

**Context - Find this existing code** (lines 305-309):
```python
        result_payload = None

        self._turn_count = 0

        # Send initial message
```

**Insert after `result_payload = None` (new line 308)**:
```python
        result_payload = None
        generation_span = None  # Track current generation for usage updates

        # Initialize Langfuse tracing
        trace = None
        if self._langfuse_enabled and self._langfuse_client:
            try:
                trace = self._langfuse_client.trace(
                    name="agentic-session",
                    session_id=self.context.session_id,
                    input={"prompt": prompt},
                    metadata={
                        "namespace": os.getenv("NAMESPACE", "unknown"),
                        "project": os.getenv("PROJECT_NAME", "unknown"),
                        "interactive": self.context.get_env('INTERACTIVE', 'false'),
                        "model": self.context.get_env('LLM_MODEL', 'claude-sonnet-4'),
                        "workspace": str(self.context.workspace_path),
                    }
                )
            except Exception as e:
                print(f"Warning: Failed to create Langfuse trace: {e}")
                trace = None

        self._turn_count = 0
        # [Continue with existing code...]
```

**Lines added**: 22 new lines

---

#### Insertion Point 2: Update `process_one_prompt()` (Replace lines 410-413)

**Context - Find this existing code** (lines 408-415):
```python
        # Helper function for processing prompts
        async def process_one_prompt(text: str):
            await self.shell._send_message(MessageType.AGENT_RUNNING, {})
            await client.query(text)
            await process_response_stream(client)

        # Create Claude SDK client
        async with ClaudeSDKClient(options=options) as client:
```

**Replace lines 410-413 with** (the `process_one_prompt` function body):
```python
        # Helper function for processing prompts
        async def process_one_prompt(text: str):
            nonlocal generation_span

            await self.shell._send_message(MessageType.AGENT_RUNNING, {})

            # Create Langfuse generation span for this query
            if trace:
                try:
                    generation_span = trace.generation(
                        name="claude-query",
                        input={"prompt": text},
                        model=self.context.get_env('LLM_MODEL', 'claude-sonnet-4'),
                    )
                except Exception as e:
                    print(f"Warning: Failed to create Langfuse generation: {e}")

            await client.query(text)
            await process_response_stream(client)
```

**Lines changed**: 4 lines → 16 lines (+12 lines)

---

#### Insertion Point 3: Update ResultMessage Handler (In `process_response_stream`, lines 385-402)

**Context - Find this existing code** (lines 383-405):
```python
                elif isinstance(message, (ResultMessage)):
                    result_payload = {
                        "subtype": getattr(message, 'subtype', None),
                        "duration_ms": getattr(message, 'duration_ms', None),
                        "duration_api_ms": getattr(message, 'duration_api_ms', None),
                        "is_error": getattr(message, 'is_error', None),
                        "num_turns": getattr(message, 'num_turns', None),
                        "session_id": getattr(message, 'session_id', None),
                        "total_cost_usd": getattr(message, 'total_cost_usd', None),
                        "usage": getattr(message, 'usage', None),
                        "result": getattr(message, 'result', None),
                    }

                    if not interactive:
                        await self.shell._send_message(
                            MessageType.AGENT_MESSAGE,
                            {"type": "result.message", "payload": result_payload},
                        )

        # Helper function for processing prompts
        async def process_one_prompt(text: str):
```

**Replace the ResultMessage handler (lines 385-402) with**:
```python
                elif isinstance(message, (ResultMessage)):
                    nonlocal generation_span

                    result_payload = {
                        "subtype": getattr(message, 'subtype', None),
                        "duration_ms": getattr(message, 'duration_ms', None),
                        "duration_api_ms": getattr(message, 'duration_api_ms', None),
                        "is_error": getattr(message, 'is_error', None),
                        "num_turns": getattr(message, 'num_turns', None),
                        "session_id": getattr(message, 'session_id', None),
                        "total_cost_usd": getattr(message, 'total_cost_usd', None),
                        "usage": getattr(message, 'usage', None),
                        "result": getattr(message, 'result', None),
                    }

                    # Update Langfuse generation with usage data
                    if generation_span:
                        try:
                            usage_data = getattr(message, 'usage', None) or {}
                            generation_span.update(
                                output={"result": getattr(message, 'result', None)},
                                usage={
                                    "input": usage_data.get('input_tokens', 0),
                                    "output": usage_data.get('output_tokens', 0),
                                    "total": usage_data.get('total_tokens', 0),
                                },
                                metadata={
                                    "cost_usd": getattr(message, 'total_cost_usd'),
                                    "duration_ms": getattr(message, 'duration_ms'),
                                    "duration_api_ms": getattr(message, 'duration_api_ms'),
                                    "num_turns": getattr(message, 'num_turns'),
                                }
                            )
                            generation_span.end()
                            generation_span = None  # Clear for next query
                        except Exception as e:
                            print(f"Warning: Failed to update Langfuse generation: {e}")

                    if not interactive:
                        await self.shell._send_message(
                            MessageType.AGENT_MESSAGE,
                            {"type": "result.message", "payload": result_payload},
                        )
```

**Lines changed**: 18 lines → 43 lines (+25 lines)

---

#### Insertion Point 4: Method Cleanup (Before final return, around line 456)

**Context - Find this existing code** (lines 452-463):
```python
        # Check for PR intent and push if configured
        # [existing PR auto-push logic...]

        return result

    async def _handle_user_input(self, incoming_data: dict):
        """Handle incoming user input in interactive mode."""
```

**Insert before `return result` (around line 456)**:
```python
        # Check for PR intent and push if configured
        # [existing PR auto-push logic...]

        # Update trace with final session outcome
        if trace:
            try:
                trace.update(
                    output={
                        "success": result.get("success"),
                        "turns": self._turn_count,
                    },
                    metadata={
                        "total_cost_usd": result_payload.get("total_cost_usd") if result_payload else None,
                        "duration_ms": result_payload.get("duration_ms") if result_payload else None,
                    }
                )
            except Exception as e:
                print(f"Warning: Failed to update Langfuse trace: {e}")

        # Flush Langfuse data before returning
        if self._langfuse_enabled and self._langfuse_client:
            try:
                self._langfuse_client.flush()
            except Exception as e:
                print(f"Warning: Failed to flush Langfuse: {e}")

        return result
```

**Lines added**: 22 new lines

---

### Summary of Changes

**Total modifications**:
- Insertion Point 1: +22 lines (trace initialization)
- Insertion Point 2: +12 lines (generation span creation)
- Insertion Point 3: +25 lines (usage data capture)
- Insertion Point 4: +22 lines (trace finalization + flush)

**Total**: ~81 new lines inserted (method grows from 318 → 399 lines, or 25% increase)

**Why this works**:
1. **No logic changes**: Existing code flow unchanged
2. **Scoped variables**: `trace` and `generation_span` accessible via `nonlocal`
3. **Graceful degradation**: All Langfuse calls wrapped in try/except
4. **Clear instrumentation**: Easy to identify and maintain Langfuse code

---

### Step 5: Configure Operator to Inject Langfuse Config

**File**: `components/operator/internal/handlers/sessions.go`

**Location**: Job creation logic (around line 300-450)

**Find the Job spec environment variables section**. Look for:
```go
Env: []corev1.EnvVar{
    {
        Name:  "ANTHROPIC_API_KEY",
        Value: apiKey,
    },
    // ... other env vars
},
```

**Add Langfuse environment variables via EnvFrom**:
```go
Env: []corev1.EnvVar{
    {
        Name:  "ANTHROPIC_API_KEY",
        Value: apiKey,
    },
    {
        Name:  "NAMESPACE",
        Value: namespace,
    },
    {
        Name:  "PROJECT_NAME",
        ValueFrom: &corev1.EnvVarSource{
            FieldRef: &corev1.ObjectFieldSelector{
                FieldPath: "metadata.namespace",
            },
        },
    },
    // ... other existing env vars
},
EnvFrom: []corev1.EnvFromSource{
    {
        SecretRef: &corev1.SecretEnvSource{
            LocalObjectReference: corev1.LocalObjectReference{
                Name: "langfuse-keys",
            },
            Optional: boolPtr(true),  // Don't fail if secret missing
        },
    },
    {
        ConfigMapRef: &corev1.ConfigMapEnvSource{
            LocalObjectReference: corev1.LocalObjectReference{
                Name: "langfuse-config",
            },
            Optional: boolPtr(true),  // Don't fail if configmap missing
        },
    },
},
```

**Add helper function if not present** (at end of file):
```go
func boolPtr(b bool) *bool {
    return &b
}
```

**Why Optional=true**:
- Allows gradual rollout (Langfuse not required initially)
- Backward compatible with existing deployments
- Enables/disables instrumentation via LANGFUSE_ENABLED flag

---

### Step 6: Create Langfuse Configuration Resources

**Create two Kubernetes resources in the ambient-code namespace.**

**File**: `components/manifests/langfuse/langfuse-config.yaml` (new file)

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: langfuse-config
  namespace: ambient-code
data:
  LANGFUSE_HOST: "http://langfuse-web.langfuse.svc.cluster.local:3000"
  LANGFUSE_ENABLED: "true"
---
apiVersion: v1
kind: Secret
metadata:
  name: langfuse-keys
  namespace: ambient-code
type: Opaque
stringData:
  # REPLACE WITH ACTUAL KEYS FROM LANGFUSE UI
  LANGFUSE_PUBLIC_KEY: "pk-lf-REPLACE-ME"
  LANGFUSE_SECRET_KEY: "sk-lf-REPLACE-ME"
```

**Update deployment script**: `components/manifests/deploy.sh`

**Add after namespace creation** (around line 50):
```bash
# Create Langfuse configuration (optional)
echo "Creating Langfuse configuration..."
kubectl apply -f langfuse/langfuse-config.yaml -n "$NAMESPACE" || echo "Warning: Langfuse config creation failed (optional)"
```

**Manual application**:
```bash
# Get API keys from Langfuse UI first
kubectl apply -f components/manifests/langfuse/langfuse-config.yaml
```

---

## Testing Instructions

### Test 1: Verify Dependency Installation

```bash
cd components/runners/claude-code-runner
uv pip install -e .
python -c "from langfuse import Langfuse; print('Langfuse imported successfully')"
```

**Expected**: No errors, prints "Langfuse imported successfully"

### Test 2: Verify Langfuse Configuration

```bash
# Check ConfigMap exists
kubectl get configmap langfuse-config -n ambient-code

# Check Secret exists
kubectl get secret langfuse-keys -n ambient-code

# Verify values
kubectl get configmap langfuse-config -n ambient-code -o yaml
kubectl get secret langfuse-keys -n ambient-code -o jsonpath='{.data.LANGFUSE_PUBLIC_KEY}' | base64 -d
```

**Expected**: Resources exist, public key starts with "pk-lf-"

### Test 3: Deploy Instrumented Runner

```bash
# Rebuild runner image
cd components/runners/claude-code-runner
make build

# Update deployment
kubectl rollout restart deployment/vteam-operator -n ambient-code
```

### Test 4: Create Test Session

Create a simple AgenticSession:

```yaml
apiVersion: vteam.ambient-code/v1alpha1
kind: AgenticSession
metadata:
  name: langfuse-test-01
  namespace: ambient-code
spec:
  prompt: "What is 2+2? Please respond with just the number."
  repos:
    - url: "https://github.com/jeremyeder/platform.git"
      branch: "main"
      input: true
  timeout: 300
```

Apply:
```bash
kubectl apply -f test-session.yaml
```

### Test 5: Verify Trace in Langfuse

1. **Monitor Job Logs**:
   ```bash
   kubectl logs -f job/langfuse-test-01-job -n ambient-code
   ```

   **Expected output**:
   ```
   Langfuse client initialized: http://langfuse-web.langfuse.svc.cluster.local:3000
   Starting Claude Code session...
   ...
   Session completed in XXXms
   ```

2. **Check Langfuse UI**:
   - Access: `http://langfuse.local:8080` (or your Langfuse URL)
   - Navigate to: Traces
   - Look for trace with session_id = "langfuse-test-01"

3. **Query Langfuse API**:
   ```bash
   curl -u "pk-lf-XXX:sk-lf-XXX" \
     "http://langfuse.local:8080/api/public/traces" | jq
   ```

   **Expected**: JSON with traces, including your test session

### Test 6: Validate Trace Data

In Langfuse UI, verify the trace contains:

- ✅ **Metadata**:
  - `namespace`: "ambient-code"
  - `project`: "ambient-code"
  - `model`: "claude-sonnet-4" (or configured model)
  - `interactive`: "false"

- ✅ **Input**:
  - `prompt`: "What is 2+2? Please respond with just the number."

- ✅ **Generation(s)**:
  - At least one generation named "claude-query"
  - `usage.input` > 0 (input tokens)
  - `usage.output` > 0 (output tokens)
  - `metadata.cost_usd` present
  - `metadata.duration_ms` present

- ✅ **Output**:
  - `success`: true
  - `turns`: >= 1

### Test 7: Test Interactive Mode

Create interactive session:

```yaml
apiVersion: vteam.ambient-code/v1alpha1
kind: AgenticSession
metadata:
  name: langfuse-interactive-test
  namespace: ambient-code
spec:
  prompt: "Hello, I need help with some code."
  repos:
    - url: "https://github.com/jeremyeder/platform.git"
      branch: "main"
      input: true
  interactive: true
  timeout: 600
```

**Expected**: Multiple generations visible in trace (one per user message)

---

## Success Criteria

Phase 2 instrumentation is complete when:

- ✅ **Build succeeds**: Runner image builds with langfuse dependency
- ✅ **Deployment healthy**: No CrashLoopBackOff or errors in runner pods
- ✅ **Traces created**: Test session creates trace in Langfuse UI
- ✅ **Metadata captured**: Session namespace, project, model visible
- ✅ **Token usage tracked**: Input/output tokens shown per generation
- ✅ **Cost tracked**: `cost_usd` present in trace metadata
- ✅ **Latency tracked**: `duration_ms` captured
- ✅ **Interactive works**: Multi-turn sessions create multiple generations
- ✅ **Graceful degradation**: Sessions work even if Langfuse unavailable
- ✅ **No performance regression**: Session latency increase < 5%

---

## Troubleshooting

### Issue: "Langfuse client initialized" not in logs

**Cause**: Environment variables not injected

**Fix**:
```bash
# Check if secret/configmap exist
kubectl get secret langfuse-keys -n ambient-code
kubectl get configmap langfuse-config -n ambient-code

# Check if operator injects them
kubectl describe job langfuse-test-01-job -n ambient-code | grep -A 10 "Environment"
```

### Issue: "Failed to initialize Langfuse" error

**Cause**: Invalid API keys or unreachable host

**Fix**:
```bash
# Verify keys
kubectl get secret langfuse-keys -n ambient-code -o yaml

# Test connectivity from pod
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -- \
  curl http://langfuse-web.langfuse.svc.cluster.local:3000/api/public/health
```

### Issue: Traces not appearing in UI

**Cause**: `flush()` not called or network issue

**Fix**:
1. Check runner logs for "Failed to flush Langfuse" warnings
2. Verify Langfuse web pod is running: `kubectl get pods -n langfuse`
3. Query API directly: `curl -u "pk:sk" http://langfuse.local:8080/api/public/traces`

### Issue: ImportError for langfuse module

**Cause**: Dependency not installed in container

**Fix**:
```bash
# Rebuild container image
cd components/runners/claude-code-runner
make build

# Verify image has langfuse
docker run --rm <image> python -c "import langfuse"
```

### Issue: Generation usage data is 0 or None

**Cause**: `result_payload` not populated by SDK

**Fix**:
1. Check SDK version: `pip show claude-code-sdk`
2. Verify ResultMessage is received in logs
3. Add debug logging in `process_response_stream()`

---

## Rollback Plan

If instrumentation causes issues:

1. **Disable Langfuse**:
   ```bash
   kubectl patch configmap langfuse-config -n ambient-code \
     --type merge -p '{"data":{"LANGFUSE_ENABLED":"false"}}'

   kubectl rollout restart deployment/vteam-operator -n ambient-code
   ```

2. **Remove instrumentation**:
   ```bash
   git revert <commit-hash>
   # Rebuild and redeploy
   ```

3. **Emergency fix**: Edit `wrapper.py` and set:
   ```python
   self._langfuse_enabled = False  # Force disable
   ```

---

## Next Steps After Phase 2

Once Phase 2 is complete and validated:

1. **Analyze traces**: Use Langfuse UI to understand token usage patterns
2. **Cost optimization**: Identify high-cost sessions for optimization
3. **Performance tuning**: Analyze latency data, optimize slow paths
4. **Expand instrumentation**: Add Backend/Operator tracing (Phase 3)
5. **Multi-tenancy**: Implement per-project Langfuse isolation (Phase 3)

See `langfuse-phase3-ideas.md` for advanced features.

---

## Reference Files

- **Phase 2 Context**: `docs/deployment/langfuse-phase2-context.md`
- **Phase 3 Ideas**: `docs/deployment/langfuse-phase3-ideas.md`
- **Phase 1 PR**: https://github.com/jeremyeder/platform/pull/30
- **Target File**: `components/runners/claude-code-runner/wrapper.py`
- **Operator File**: `components/operator/internal/handlers/sessions.go`
- **Langfuse Docs**: https://langfuse.com/docs/sdk/python

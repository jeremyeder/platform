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

**Location**: `_run_claude_agent_sdk()` method starts at line 152

**Strategy**: Wrap the entire method with a Langfuse trace (span), and wrap each `client.query()` call with a generation observation.

**Current method signature** (line 152):
```python
async def _run_claude_agent_sdk(self, prompt: str):
    """Execute the Claude Code SDK with the given prompt."""
```

**Replace the entire method with this instrumented version**:

```python
async def _run_claude_agent_sdk(self, prompt: str):
    """Execute the Claude Code SDK with the given prompt."""

    # Initialize trace context
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

    result = {
        "success": False,
        "message": "",
        "error": None,
    }
    result_payload = None

    try:
        # [EXISTING CODE STARTS HERE - Keep all existing logic]

        # Send initial message
        await self.shell._send_message(MessageType.AGENT_MESSAGE, {
            "role": "assistant",
            "content": "Starting Claude Code session..."
        })

        # Update CR status to Running
        await self.shell._send_message(MessageType.STATUS_UPDATE, {
            "phase": "Running",
            "message": "Claude Code session started"
        })

        # Authentication setup (existing code - lines 158-196)
        use_vertex = self.context.get_env('USE_VERTEX_AI', 'false').lower() == 'true'

        if use_vertex:
            # Vertex AI authentication (existing code)
            project_id = self.context.get_env('VERTEX_PROJECT_ID')
            location = self.context.get_env('VERTEX_LOCATION', 'us-east5')

            if not project_id:
                raise ValueError("VERTEX_PROJECT_ID required when USE_VERTEX_AI=true")

            # Import Vertex auth (existing code)
            from anthropic import AnthropicVertex

            auth_client = AnthropicVertex(
                project_id=project_id,
                region=location,
            )
        else:
            # Standard API key authentication (existing code)
            api_key = self.context.get_env('ANTHROPIC_API_KEY')
            if not api_key:
                raise ValueError("ANTHROPIC_API_KEY environment variable required")

        # Import SDK (existing code - line 197)
        from claude_agent_sdk import ClaudeSDKClient

        # Prepare SDK options (existing code - lines 198-405)
        options = {
            "working_directory": str(self.context.workspace_path),
        }

        # Configure authentication
        if use_vertex:
            options["anthropic_client"] = auth_client
        else:
            options["api_key"] = api_key

        # Set model if specified
        model = self.context.get_env('LLM_MODEL')
        if model:
            options["model"] = model

        # Set timeout
        timeout = self.context.get_env('TIMEOUT')
        if timeout:
            try:
                options["timeout_seconds"] = int(timeout)
            except ValueError:
                pass

        # Response stream processor (existing code - lines 326-403)
        async def process_response_stream(client_obj):
            """Process streaming responses from Claude SDK."""
            nonlocal result_payload

            async for message in client_obj.receive_response():
                message_type = type(message).__name__

                if message_type == "AssistantMessage":
                    # Stream assistant content blocks
                    for block in message.content:
                        block_type = type(block).__name__

                        if block_type == "TextBlock":
                            await self.shell._send_message(MessageType.AGENT_MESSAGE, {
                                "role": "assistant",
                                "content": block.text,
                                "type": "text"
                            })

                        elif block_type == "ToolUseBlock":
                            await self.shell._send_message(MessageType.AGENT_MESSAGE, {
                                "role": "assistant",
                                "content": f"Using tool: {block.name}",
                                "type": "tool_use",
                                "tool_name": block.name,
                                "tool_input": block.input
                            })

                elif message_type == "UserMessage":
                    # Stream user message (tool results)
                    for block in message.content:
                        block_type = type(block).__name__

                        if block_type == "ToolResultBlock":
                            await self.shell._send_message(MessageType.AGENT_MESSAGE, {
                                "role": "user",
                                "content": f"Tool result: {block.content[:200]}...",
                                "type": "tool_result",
                                "tool_use_id": block.tool_use_id
                            })

                elif message_type == "ResultMessage":
                    # Capture final result with usage data
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

                    # Send result summary
                    await self.shell._send_message(MessageType.AGENT_MESSAGE, {
                        "role": "system",
                        "content": f"Session completed in {result_payload['duration_ms']}ms",
                        "type": "result",
                        "usage": result_payload['usage'],
                        "cost": result_payload['total_cost_usd']
                    })

        # Helper to instrument a single query
        async def process_one_prompt(text: str):
            """Process a single prompt with Langfuse generation tracking."""
            generation = None

            # Create generation span if tracing enabled
            if trace:
                try:
                    generation = trace.generation(
                        name="claude-query",
                        input=text,
                        model=self.context.get_env('LLM_MODEL', 'claude-sonnet-4'),
                    )
                except Exception as e:
                    print(f"Warning: Failed to create Langfuse generation: {e}")

            # Send query to Claude API
            await self.shell._send_message(MessageType.AGENT_RUNNING, {})
            await client.query(text)

            # Process streaming response
            await process_response_stream(client)

            # Update generation with usage data if available
            if generation and result_payload:
                try:
                    usage_data = result_payload.get("usage", {})
                    generation.update(
                        output=result_payload.get("result"),
                        usage={
                            "input": usage_data.get("input_tokens", 0),
                            "output": usage_data.get("output_tokens", 0),
                            "total": usage_data.get("total_tokens", 0),
                        },
                        metadata={
                            "cost_usd": result_payload.get("total_cost_usd"),
                            "duration_ms": result_payload.get("duration_ms"),
                            "duration_api_ms": result_payload.get("duration_api_ms"),
                            "num_turns": result_payload.get("num_turns"),
                        }
                    )
                except Exception as e:
                    print(f"Warning: Failed to update Langfuse generation: {e}")

        # Create Claude SDK client
        async with ClaudeSDKClient(options=options) as client:
            # Check if interactive mode
            interactive = self.context.get_env('INTERACTIVE', 'false').lower() == 'true'

            if not interactive:
                # BATCH MODE: Single prompt-response
                await process_one_prompt(prompt)

            else:
                # INTERACTIVE MODE: Multi-turn chat
                # Send initial prompt if provided
                if prompt and prompt.strip():
                    await process_one_prompt(prompt)

                # Interactive loop
                while not self._session_ended:
                    try:
                        # Wait for incoming message from user
                        incoming = await asyncio.wait_for(
                            self._incoming_queue.get(),
                            timeout=3600  # 1 hour timeout
                        )

                        msg_type = incoming.get("type")

                        if msg_type == "user_message":
                            text = incoming.get("text", "").strip()
                            if text:
                                self._turn_count += 1
                                await process_one_prompt(text)

                        elif msg_type == "end_session":
                            self._session_ended = True
                            break

                    except asyncio.TimeoutError:
                        # Session timeout
                        await self.shell._send_message(MessageType.AGENT_MESSAGE, {
                            "role": "system",
                            "content": "Session timeout after 1 hour of inactivity"
                        })
                        break

        # Mark as successful
        result["success"] = True
        result["message"] = "Claude Code session completed successfully"

        # Update trace with final result
        if trace:
            try:
                trace.update(
                    output={
                        "success": True,
                        "turns": self._turn_count,
                        "interactive": interactive,
                    },
                    metadata={
                        "total_cost_usd": result_payload.get("total_cost_usd") if result_payload else None,
                        "total_duration_ms": result_payload.get("duration_ms") if result_payload else None,
                    }
                )
            except Exception as e:
                print(f"Warning: Failed to update Langfuse trace: {e}")

    except Exception as e:
        # Handle errors
        error_msg = str(e)
        result["success"] = False
        result["error"] = error_msg
        result["message"] = f"Claude Code session failed: {error_msg}"

        # Update trace with error
        if trace:
            try:
                trace.update(
                    level="ERROR",
                    output={"error": error_msg},
                    metadata={"exception_type": type(e).__name__}
                )
            except Exception as trace_error:
                print(f"Warning: Failed to update Langfuse trace with error: {trace_error}")

        # Send error message
        await self.shell._send_message(MessageType.AGENT_MESSAGE, {
            "role": "system",
            "content": f"Error: {error_msg}",
            "type": "error"
        })

        raise

    finally:
        # Flush Langfuse events
        if self._langfuse_enabled and self._langfuse_client:
            try:
                self._langfuse_client.flush()
            except Exception as e:
                print(f"Warning: Failed to flush Langfuse: {e}")

    return result
```

**Key Changes Explained**:

1. **Trace Creation** (top of method):
   - Creates session-level trace with metadata
   - Gracefully degrades if Langfuse unavailable

2. **Generation Tracking** (`process_one_prompt`):
   - Wraps each `client.query()` call with generation span
   - Captures token usage from `result_payload`
   - Records cost, latency, turn count

3. **Error Handling**:
   - Updates trace with error info on exceptions
   - Doesn't break session if Langfuse fails

4. **Cleanup** (finally block):
   - Ensures Langfuse events are flushed before exit

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

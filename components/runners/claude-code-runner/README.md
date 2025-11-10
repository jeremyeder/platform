# Claude Code Runner

Python-based runner implementation that executes Claude Code CLI sessions within the Ambient Code Platform.

## Overview

The Claude Code Runner bridges the Claude Code CLI with the platform's standardized runner-shell framework, enabling:

- **Streaming execution**: Real-time output via Claude Code SDK
- **Workspace synchronization**: PVC-backed workspace sharing
- **Multi-agent collaboration**: Support for agent-to-agent communication
- **Langfuse instrumentation**: Automatic trace collection for observability

## Architecture

```
AgenticSession CR → Operator → Job Pod → Claude Code Runner
                                              ↓
                                    Claude Code CLI (via SDK)
                                              ↓
                                    Langfuse (traces/generations)
```

## Development

### Setup

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate

# Install dependencies (development mode)
uv pip install -e ".[dev]"
```

### Running Tests

#### Langfuse E2E Test

Tests end-to-end Langfuse instrumentation by creating a real AgenticSession via the backend API and verifying trace creation in Langfuse.

**Prerequisites**:
- kubectl configured and connected to cluster
- Langfuse deployed in cluster (see `components/manifests/langfuse/`)
- Langfuse config/secret in `ambient-code` namespace
- Anthropic API key configured in `ambient-code` project (via ProjectSettings)
- Backend service running

**Run test**:

```bash
# Automatic setup (fetches config from cluster)
./run-langfuse-test.sh

# Or manually with environment variables
export LANGFUSE_HOST="http://localhost:3000"
export LANGFUSE_PUBLIC_KEY="pk-lf-your-key"
export LANGFUSE_SECRET_KEY="sk-lf-your-key"
python tests/test_langfuse_e2e.py
```

**How it works**:
1. ✅ Authenticates with backend API using service account token
2. ✅ Creates AgenticSession via `POST /api/projects/ambient-code/agentic-sessions`
3. ✅ Polls `GET /api/projects/ambient-code/agentic-sessions/{name}` until completion
4. ✅ Queries Langfuse API for trace with matching session ID
5. ✅ Verifies trace has generations with token usage data
6. ✅ Cleans up session via `DELETE /api/projects/ambient-code/agentic-sessions/{name}`

**Why backend API instead of direct Kubernetes**:
- Tests the actual user workflow (same API the frontend uses)
- Backend handles all Kubernetes resource creation automatically
- Simpler and more maintainable (~280 lines vs ~400+)
- Independent of operator implementation details

**Expected output**:

```
============================================================
Langfuse E2E Test - Test ID: 1699564321-a1b2-c3d4-e5f6
============================================================

Getting service account token for backend API authentication
✓ Got service account token (length: 1234)
Creating AgenticSession via backend API
✓ Session created: agentic-session-1699564321

Waiting for session completion (timeout: 300s)
[0s] Check #1 - Phase: Pending
[5s] Check #2 - Phase: Creating
[10s] Check #3 - Phase: Running
...
[45s] Check #9 - Phase: Completed

✓ Session completed successfully

Waiting 10 seconds for Langfuse to process trace...

Verifying Langfuse trace...
✓ Trace found for session: agentic-session-1699564321
✓ Generation has usage data (input_tokens=156)
✓ Prompt contains test ID marker: 1699564321-a1b2-c3d4-e5f6
✅ Langfuse verification complete

Cleaning up session: agentic-session-1699564321
✓ Session deleted successfully

============================================================
✅ TEST PASSED
============================================================
```

**Troubleshooting**:

| Issue | Solution |
|-------|----------|
| `No module named 'kubernetes'` or `'requests'` | Run `uv pip install -e ".[dev]"` |
| `401 Unauthorized` | Service account token invalid. Check backend service is running and accessible |
| `Connection refused` (local test) | Start port-forwarding: `kubectl port-forward -n ambient-code svc/backend-service 8080:8080 &` and `kubectl port-forward -n langfuse svc/langfuse-web 3000:3000 &`, then run with `BACKEND_URL=http://localhost:8080 LANGFUSE_HOST=http://localhost:3000 ./run-langfuse-test.sh` |
| `Session failed: secret "ambient-non-vertex-integrations" not found` | Create secrets: `kubectl create secret generic ambient-non-vertex-integrations -n ambient-code --from-literal=ANTHROPIC_API_KEY=<your-key>` and `kubectl create secret generic ambient-runner-secrets -n ambient-code --from-literal=dummy=value` |
| `Session failed` | Check session logs: `kubectl logs -n ambient-code -l job-name=<session-name>-job` |
| No trace in Langfuse | **Current issue**: Operator needs rebuild to inject langfuse-config ConfigMap. Verify operator image includes code from sessions.go:589. Workaround: Session execution works; trace verification will pass once operator is updated. |
| Session times out | Check if Anthropic API key exists in `ambient-non-vertex-integrations` secret |

## Environment Variables

### Required (Runtime)

- `ANTHROPIC_API_KEY`: Anthropic API key for Claude Code CLI
- `PROMPT`: User prompt to execute
- `SESSION_ID`: Unique session identifier
- `WEBSOCKET_URL`: Backend WebSocket endpoint for streaming results

### Optional (Langfuse)

- `LANGFUSE_ENABLED`: Enable Langfuse tracing (default: `false`)
- `LANGFUSE_HOST`: Langfuse API endpoint (default: `http://langfuse-web.langfuse.svc.cluster.local:3000`)
- `LANGFUSE_PUBLIC_KEY`: Langfuse public API key
- `LANGFUSE_SECRET_KEY`: Langfuse secret API key

### Optional (Vertex AI)

- `VERTEX_PROJECT_ID`: Google Cloud project ID
- `VERTEX_REGION`: Google Cloud region (e.g., `us-central1`)
- `VERTEX_USER_TOKEN`: User's Google Cloud access token
- `VERTEX_ENABLED`: Enable Vertex AI mode (default: `false`)

## Langfuse Instrumentation

The runner automatically instruments Claude Code sessions with Langfuse when enabled:

1. **Trace creation**: One trace per AgenticSession (named with `session_id`)
2. **Span hierarchy**: Captures message exchanges, tool calls, and results
3. **Token usage**: Records input/output tokens for cost tracking
4. **Metadata**: Includes model, session parameters, and execution context

See `wrapper.py:24-561` for implementation details.

## Container Build

```bash
# Build image
docker build -t quay.io/ambient_code/vteam_claude_runner:latest .

# Push to registry
docker push quay.io/ambient_code/vteam_claude_runner:latest
```

## Related Documentation

- **Platform README**: `../../README.md` (root of repository)
- **Langfuse Phase 2**: `docs/deployment/langfuse-phase2-implementation-prompt.md`
- **Runner Shell Framework**: `runner-shell/README.md` (if exists)
- **Operator Integration**: `components/operator/README.md`

## License

See repository root for license information.

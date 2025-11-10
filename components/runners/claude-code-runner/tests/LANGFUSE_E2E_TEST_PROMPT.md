# Langfuse E2E Test Implementation Prompt

**Context**: This prompt enables cold-start implementation of a Python e2e test for Langfuse instrumentation validation in the Ambient Code Platform.

**Date Created**: 2025-11-10
**Branch**: langfuse-phase-2
**Related Commit**: 2c6d6a2 (Langfuse Phase 2 instrumentation)

---

## Objective

Create a **single Python file** e2e test that validates Langfuse instrumentation is working correctly in the Claude Code Runner by:
1. Creating a test namespace
2. Creating an AgenticSession with unique markers
3. Waiting for session completion
4. Verifying trace exists in Langfuse
5. Cleaning up all resources

## Requirements

### Simplicity Constraints
- ✅ **ONE file only**: `tests/test_langfuse_e2e.py`
- ✅ **No helper modules**: All logic in one file
- ✅ **No pytest complexity**: Simple Python script, can run with `python tests/test_langfuse_e2e.py`
- ✅ **~150 lines** total

### Functional Requirements
1. **Test Namespace Isolation**:
   - Create unique test namespace: `langfuse-test-{test-id}`
   - All resources created in test namespace
   - Clean up namespace at end (cascading delete)

2. **Unique Identifiers**:
   - Format: `{unix-timestamp}-{uuid4-first-16-chars-hyphenated}`
   - Example: `1699564321-a1b2-c3d4-e5f6-7890`
   - Embed in:
     - Namespace name: `langfuse-test-1699564321-a1b2-c3d4-e5f6-7890`
     - Session name: `test-1699564321-a1b2-c3d4-e5f6-7890`
     - Prompt text: `"Test session 1699564321-a1b2-c3d4-e5f6-7890: What is 2+2?"`

3. **Langfuse Configuration**:
   - Read from environment variables: `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`
   - Create ConfigMap and Secret in test namespace
   - OR: Rely on operator to inject from ambient-code namespace (simpler)

4. **AgenticSession Spec**:
   ```yaml
   apiVersion: vteam.ambient-code/v1alpha1
   kind: AgenticSession
   metadata:
     name: test-{test-id}
     namespace: langfuse-test-{test-id}
   spec:
     prompt: "Test session {test-id}: What is 2+2? Please respond with just the number."
     timeout: 300
     interactive: false
     llmSettings:
       model: "claude-sonnet-4-20250514"
   ```

5. **Validation Steps**:
   - Wait up to 5 minutes for Job completion
   - Query Langfuse API: `GET {LANGFUSE_HOST}/api/public/traces?sessionId=test-{test-id}`
   - Verify trace exists
   - Verify trace has generation with token usage (input_tokens > 0)
   - Verify prompt in trace contains test-id marker

6. **Cleanup**:
   - Delete test namespace (cascades to all resources)
   - Use try/finally to ensure cleanup happens even on failure

## Technical Details

### Dependencies Already Available
From `pyproject.toml` dev-dependencies:
- `kubernetes>=28.1.0` (ALREADY ADDED)
- `pytest>=7.4.0`
- `pytest-asyncio>=0.21.0`

### Kubernetes Client Usage
```python
from kubernetes import client, config

# Load kubeconfig
config.load_kube_config()

# Create clients
core_api = client.CoreV1Api()
batch_api = client.BatchV1Api()
custom_api = client.CustomObjectsApi()

# Create namespace
namespace = client.V1Namespace(
    metadata=client.V1ObjectMeta(name=namespace_name)
)
core_api.create_namespace(namespace)

# Create AgenticSession CR
session_spec = {
    "apiVersion": "vteam.ambient-code/v1alpha1",
    "kind": "AgenticSession",
    "metadata": {"name": session_name, "namespace": namespace_name},
    "spec": {...}
}
custom_api.create_namespaced_custom_object(
    group="vteam.ambient-code",
    version="v1alpha1",
    namespace=namespace_name,
    plural="agenticsessions",
    body=session_spec
)

# Wait for Job completion
while timeout_not_reached:
    job = batch_api.read_namespaced_job(job_name, namespace_name)
    if job.status.succeeded:
        break
    time.sleep(5)

# Delete namespace (cascades to all resources)
core_api.delete_namespace(namespace_name)
```

### Langfuse API Query
```python
import requests

url = f"{langfuse_host}/api/public/traces"
params = {"sessionId": f"test-{test_id}"}
headers = {
    "Authorization": f"Bearer {langfuse_public_key}:{langfuse_secret_key}"
}
response = requests.get(url, params=params, headers=headers)
traces = response.json()

# Verify trace exists
assert len(traces) > 0, "No trace found in Langfuse"

# Verify generation with usage
trace = traces[0]
assert "generations" in trace
assert len(trace["generations"]) > 0
gen = trace["generations"][0]
assert gen.get("usage", {}).get("input", 0) > 0
```

### Unique ID Generation
```python
import uuid
import time

timestamp = int(time.time())
uuid_part = str(uuid.uuid4())[:19]  # "a1b2c3d4-e5f6-7890-abcd"
test_id = f"{timestamp}-{uuid_part}"
```

### Job Name Discovery
The operator creates Jobs with predictable naming:
```python
job_name = f"{session_name}-job"
# Example: test-1699564321-a1b2-c3d4-e5f6-7890-job
```

## File Structure

```python
#!/usr/bin/env python3
"""
Langfuse E2E Test - Single File Implementation

Tests that AgenticSessions create Langfuse traces with proper instrumentation.
"""

import os
import sys
import time
import uuid
import requests
from kubernetes import client, config

# Constants
TIMEOUT_SECONDS = 300  # 5 minutes
POLL_INTERVAL = 5      # 5 seconds

def generate_test_id():
    """Generate unique test ID: {timestamp}-{uuid-16-hyphenated}"""
    # Implementation here

def create_test_namespace(core_api, namespace_name):
    """Create test namespace"""
    # Implementation here

def create_langfuse_config(core_api, namespace_name):
    """Create Langfuse ConfigMap and Secret in test namespace"""
    # Implementation here (optional - may rely on operator)

def create_agentic_session(custom_api, namespace_name, session_name, test_id):
    """Create AgenticSession CR"""
    # Implementation here

def wait_for_job_completion(batch_api, namespace_name, job_name, timeout):
    """Wait for Job to complete (success or failure)"""
    # Implementation here

def verify_langfuse_trace(langfuse_host, public_key, secret_key, session_id, test_id):
    """Query Langfuse API and verify trace exists with correct data"""
    # Implementation here

def cleanup_namespace(core_api, namespace_name):
    """Delete test namespace (cascades to all resources)"""
    # Implementation here

def main():
    """Main test execution"""
    # 1. Generate unique test ID
    # 2. Create test namespace
    # 3. Create AgenticSession
    # 4. Wait for completion
    # 5. Verify Langfuse trace
    # 6. Cleanup (in finally block)
    # 7. Print PASS/FAIL

if __name__ == "__main__":
    try:
        main()
        print("✅ TEST PASSED")
        sys.exit(0)
    except Exception as e:
        print(f"❌ TEST FAILED: {e}")
        sys.exit(1)
```

## Environment Variables

Required before running:
```bash
export LANGFUSE_PUBLIC_KEY="pk-lf-your-key"
export LANGFUSE_SECRET_KEY="sk-lf-your-key"
export LANGFUSE_HOST="http://localhost:3000"  # or cluster URL

# Optional: for Anthropic API
export ANTHROPIC_API_KEY="sk-ant-your-key"
```

## Running the Test

```bash
# From repository root
cd components/runners/claude-code-runner

# Install dependencies (if not already)
uv pip install -e ".[dev]"

# Run the test
python tests/test_langfuse_e2e.py
```

## Expected Output

```
Generating unique test ID...
Test ID: 1699564321-a1b2-c3d4-e5f6-7890
Creating test namespace: langfuse-test-1699564321-a1b2-c3d4-e5f6-7890
Creating AgenticSession: test-1699564321-a1b2-c3d4-e5f6-7890
Waiting for Job completion...
.....
Job completed successfully
Verifying Langfuse trace...
✓ Trace found for session: test-1699564321-a1b2-c3d4-e5f6-7890
✓ Trace has generation with usage data
✓ Prompt contains test ID marker
Cleaning up test namespace...
✅ TEST PASSED
```

## Success Criteria

- ✅ Test runs without errors
- ✅ AgenticSession is created in test namespace
- ✅ Job completes within timeout
- ✅ Langfuse trace exists with matching session_id
- ✅ Trace has generation with token usage > 0
- ✅ Prompt text in trace contains unique test-id marker
- ✅ Test namespace is deleted (verified with `kubectl get ns`)

## Troubleshooting

**Import Error: No module named 'kubernetes'**
```bash
cd components/runners/claude-code-runner
uv pip install -e ".[dev]"
```

**Error: Namespace already exists**
- Previous test run didn't clean up
- Fix: `kubectl delete namespace langfuse-test-<old-id>`
- Or: Check cleanup logic in script

**Error: LANGFUSE_HOST not set**
```bash
export LANGFUSE_HOST="http://langfuse-web.langfuse.svc.cluster.local:3000"
# Or for local testing:
kubectl port-forward -n langfuse svc/langfuse-web 3000:3000 &
export LANGFUSE_HOST="http://localhost:3000"
```

**Job times out / doesn't complete**
- Check runner pod logs: `kubectl logs -n langfuse-test-{test-id} -l job-name=test-{test-id}-job`
- Verify Anthropic API key is set
- Check operator logs: `kubectl logs -n ambient-code -l app=vteam-operator`

**No trace in Langfuse**
- Check pod logs for "Langfuse client initialized"
- Verify LANGFUSE_ENABLED=true in ConfigMap
- Verify Langfuse keys are not "REPLACE-ME" placeholders
- Check Langfuse web pod is running: `kubectl get pods -n langfuse`

## Related Files

**Implementation**:
- `components/runners/claude-code-runner/wrapper.py` - Langfuse instrumentation (lines 24-561)
- `components/operator/internal/handlers/sessions.go` - EnvFrom injection (lines 575-609)
- `components/manifests/langfuse/langfuse-config.yaml` - K8s resources

**Documentation**:
- `docs/deployment/langfuse-phase2-implementation-prompt.md` - Implementation guide
- `docs/deployment/langfuse-phase2-context.md` - Background context
- Commit: 2c6d6a2 on branch `langfuse-phase-2`

## Next Steps After Implementation

1. Run test locally to validate
2. Add to CI/CD pipeline (optional)
3. Document in main README or testing guide
4. Create similar tests for interactive mode (multi-turn sessions)

---

**Generated**: 2025-11-10
**Purpose**: Cold-start prompt for implementing Langfuse e2e test
**Status**: Ready for implementation

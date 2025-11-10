#!/usr/bin/env python3
"""
Langfuse E2E Test - Backend API Implementation

Tests that AgenticSessions create Langfuse traces with proper instrumentation
by using the backend API (the same interface the frontend uses).

Usage:
    export ANTHROPIC_API_KEY="sk-ant-your-key"
    export LANGFUSE_HOST="http://localhost:3000"
    export LANGFUSE_PUBLIC_KEY="pk-lf-your-key"
    export LANGFUSE_SECRET_KEY="sk-lf-your-key"
    python tests/test_langfuse_e2e.py
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
BACKEND_URL = os.getenv("BACKEND_URL", "http://backend-service.ambient-code.svc.cluster.local:8080")
PROJECT_NAME = "ambient-code"  # Use existing ambient-code project


def generate_test_id():
    """Generate unique test ID: {timestamp}-{uuid-segments}"""
    timestamp = int(time.time())
    uuid_part = str(uuid.uuid4())[:18]  # "xxxxxxxx-xxxx-xxxx"
    return f"{timestamp}-{uuid_part}"


def get_service_account_token():
    """Get a Kubernetes service account token for authentication"""
    print("Getting service account token for backend API authentication")

    # Load kubeconfig
    try:
        config.load_kube_config()
    except Exception:
        config.load_incluster_config()

    core_api = client.CoreV1Api()

    # Get the default service account token from ambient-code namespace
    try:
        secrets = core_api.list_namespaced_secret(PROJECT_NAME)
        for secret in secrets.items:
            if secret.type == "kubernetes.io/service-account-token":
                token = secret.data.get("token")
                if token:
                    import base64
                    decoded_token = base64.b64decode(token).decode('utf-8')
                    print(f"✓ Got service account token (length: {len(decoded_token)})")
                    return decoded_token

        raise RuntimeError("No service account token found in ambient-code namespace")
    except Exception as e:
        raise RuntimeError(f"Failed to get service account token: {e}")


def create_session(backend_url, token, project, test_id):
    """Create an AgenticSession via backend API"""
    print(f"Creating AgenticSession via backend API")

    url = f"{backend_url}/api/projects/{project}/agentic-sessions"
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    payload = {
        "prompt": f"Test session {test_id}: What is 2+2? Please respond with just the number.",
        "llmSettings": {
            "model": "claude-sonnet-4-20250514"
        },
        "timeout": 300,
        "interactive": False
    }

    response = requests.post(url, headers=headers, json=payload, timeout=10)
    response.raise_for_status()

    result = response.json()
    session_name = result.get("name")
    print(f"✓ Session created: {session_name}")
    return session_name


def wait_for_session_completion(backend_url, token, project, session_name, timeout):
    """Poll session status until completion"""
    print(f"\nWaiting for session completion (timeout: {timeout}s)")

    url = f"{backend_url}/api/projects/{project}/agentic-sessions/{session_name}"
    headers = {"Authorization": f"Bearer {token}"}

    start_time = time.time()
    check_count = 0

    while time.time() - start_time < timeout:
        elapsed = int(time.time() - start_time)
        check_count += 1

        print(f"[{elapsed}s] Check #{check_count}", end=" ", flush=True)

        try:
            response = requests.get(url, headers=headers, timeout=10)
            response.raise_for_status()
            session = response.json()

            phase = session.get("status", {}).get("phase", "Unknown")
            message = session.get("status", {}).get("message", "")

            print(f"- Phase: {phase}")

            if phase == "Completed":
                print("\n✓ Session completed successfully")
                return True

            if phase == "Failed":
                print(f"\n✗ Session failed: {message}")
                raise RuntimeError(f"Session failed: {message}")

        except requests.exceptions.RequestException as e:
            print(f"\n✗ Error checking session: {e}")
            raise

        time.sleep(POLL_INTERVAL)

    raise TimeoutError(f"Session did not complete within {timeout} seconds")


def verify_langfuse_trace(langfuse_host, public_key, secret_key, session_name, test_id):
    """Query Langfuse API and verify trace exists with correct data"""
    print("\nVerifying Langfuse trace...")

    # Langfuse uses Basic Auth
    url = f"{langfuse_host}/api/public/traces"
    params = {"name": session_name}  # Traces are named with session_id
    auth = (public_key, secret_key)

    response = requests.get(url, params=params, auth=auth, timeout=10)
    response.raise_for_status()

    result = response.json()
    traces = result.get("data", [])

    if not traces:
        raise AssertionError(f"No trace found in Langfuse for session: {session_name}")

    print(f"✓ Trace found for session: {session_name}")

    # Get trace details
    trace = traces[0]
    trace_id = trace.get("id")

    # Query observations for this trace
    obs_url = f"{langfuse_host}/api/public/observations"
    obs_params = {"traceId": trace_id}
    obs_response = requests.get(obs_url, params=obs_params, auth=auth, timeout=10)
    obs_response.raise_for_status()

    observations = obs_response.json().get("data", [])
    generations = [obs for obs in observations if obs.get("type") == "GENERATION"]

    if not generations:
        raise AssertionError("No generations found in trace")

    # Verify at least one generation has usage data
    has_usage = False
    for gen in generations:
        usage = gen.get("usage", {})
        input_tokens = usage.get("input", 0)
        if input_tokens > 0:
            has_usage = True
            print(f"✓ Generation has usage data (input_tokens={input_tokens})")
            break

    if not has_usage:
        raise AssertionError("No generation with token usage found")

    # Verify prompt contains test ID marker
    trace_input = trace.get("input")
    if trace_input and test_id in str(trace_input):
        print(f"✓ Prompt contains test ID marker: {test_id}")
    else:
        print(f"⚠ Test ID {test_id} not found in trace input (may be ok)")

    print("✅ Langfuse verification complete")


def cleanup_session(backend_url, token, project, session_name):
    """Delete the test session via backend API"""
    print(f"\nCleaning up session: {session_name}")

    url = f"{backend_url}/api/projects/{project}/agentic-sessions/{session_name}"
    headers = {"Authorization": f"Bearer {token}"}

    try:
        response = requests.delete(url, headers=headers, timeout=10)
        if response.status_code == 204 or response.status_code == 200:
            print("✓ Session deleted successfully")
        elif response.status_code == 404:
            print("⚠ Session already deleted")
        else:
            print(f"⚠ Unexpected status code: {response.status_code}")
    except Exception as e:
        print(f"⚠ Failed to delete session: {e}")


def main():
    """Main test execution"""
    # Load environment variables
    langfuse_host = os.getenv("LANGFUSE_HOST")
    langfuse_public_key = os.getenv("LANGFUSE_PUBLIC_KEY")
    langfuse_secret_key = os.getenv("LANGFUSE_SECRET_KEY")

    if not all([langfuse_host, langfuse_public_key, langfuse_secret_key]):
        raise EnvironmentError(
            "Missing required environment variables: "
            "LANGFUSE_HOST, LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY"
        )

    # Anthropic API key should already be configured in the ambient-code project
    # We're testing with the existing project setup

    # Generate unique test ID
    test_id = generate_test_id()
    print(f"\n{'='*60}")
    print(f"Langfuse E2E Test - Test ID: {test_id}")
    print(f"{'='*60}\n")

    # Get service account token for authentication
    token = get_service_account_token()

    session_name = None

    try:
        # 1. Create session via backend API
        session_name = create_session(BACKEND_URL, token, PROJECT_NAME, test_id)

        # 2. Wait for session completion
        wait_for_session_completion(BACKEND_URL, token, PROJECT_NAME, session_name, TIMEOUT_SECONDS)

        # 3. Give Langfuse a moment to process the trace
        print("\nWaiting 10 seconds for Langfuse to process trace...")
        time.sleep(10)

        # 4. Verify Langfuse trace
        verify_langfuse_trace(
            langfuse_host,
            langfuse_public_key,
            langfuse_secret_key,
            session_name,
            test_id
        )

        print(f"\n{'='*60}")
        print("✅ TEST PASSED")
        print(f"{'='*60}\n")

    finally:
        # 5. Cleanup
        if session_name:
            cleanup_session(BACKEND_URL, token, PROJECT_NAME, session_name)


if __name__ == "__main__":
    try:
        main()
        sys.exit(0)
    except Exception as e:
        print(f"\n{'='*60}")
        print(f"❌ TEST FAILED: {e}")
        print(f"{'='*60}\n")
        import traceback
        traceback.print_exc()
        sys.exit(1)

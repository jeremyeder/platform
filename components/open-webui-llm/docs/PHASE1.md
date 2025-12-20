# Phase 1: Quick Deployment Guide

This guide covers Phase 1 deployment of Open WebUI + LiteLLM on Kind cluster with minimal configuration.

## What You Get

- ✅ Web-based chat interface (Open WebUI)
- ✅ Access to Claude models via LiteLLM proxy
- ✅ No authentication (dev/testing only)
- ✅ Persistent storage for chat history
- ✅ Nginx ingress routing

## What's Not Included

This is a simple development tool for quick Claude API access. For production use cases requiring:
- OAuth authentication
- Long-running sessions with multi-agent collaboration
- GitHub/GitLab integration
- Production hardening and monitoring

See the main [Ambient Code Platform](../../../README.md) instead.

## Prerequisites

### Required

1. **Kind cluster with nginx-ingress**:
   ```bash
   cd ../../e2e
   ./scripts/setup-kind.sh
   ```

2. **Anthropic API key**: Sign up at [console.anthropic.com](https://console.anthropic.com)

3. **kubectl and kustomize**:
   ```bash
   # Check versions
   kubectl version --client
   kustomize version
   ```

### Optional

- **Podman**: If using rootless Podman, ports will be 8080/8443 instead of 80/443

## Installation Steps

### 1. Configure API Key

Create a `.env` file from the template:

```bash
cd components/open-webui-llm/overlays/phase1-kind
cp .env.example .env
```

Edit `.env` and replace the placeholder with your actual Anthropic API key:

```bash
ANTHROPIC_API_KEY=sk-ant-api01-xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
LITELLM_MASTER_KEY=sk-litellm-dev-master-key
WEBUI_AUTH=false
OPENAI_API_BASE_URL=http://litellm-service:4000/v1
```

**Security Note**: The `.env` file is excluded from git via `.gitignore`. Never commit actual API keys.

### 2. Deploy

```bash
cd ../..  # Back to components/open-webui-llm/
make phase1-deploy
```

**Expected output**:
```
Deploying Phase 1 (Kind)...
Creating namespace openwebui...
namespace/openwebui created
serviceaccount/litellm created
...
deployment.apps/litellm condition met
deployment.apps/openwebui condition met
✅ Phase 1 deployed!
```

### 3. Verify Deployment

```bash
make phase1-status
```

**Expected output**:
```
Pod Status:
NAME                         READY   STATUS    RESTARTS   AGE
litellm-xxxxx                1/1     Running   0          1m
openwebui-xxxxx              1/1     Running   0          1m

Services:
NAME                TYPE        CLUSTER-IP      PORT(S)
litellm-service     ClusterIP   10.96.xxx.xxx   4000/TCP
openwebui-service   ClusterIP   10.96.xxx.xxx   8080/TCP
```

All pods should show `Running` and `1/1 Ready`.

### 4. Access Web UI

**Docker users**:
```
http://ambient.local/chat
```

**Podman users**:
```
http://ambient.local:8080/chat
```

**First visit**:
1. No login required
2. You'll see the Open WebUI interface
3. Model selector will show Claude models

## Usage

### Select a Model

Click the model dropdown (top of chat):
- **claude-sonnet-4-5**: Recommended (balanced speed/quality)
- **claude-sonnet-3-7**: Previous version (still excellent)
- **claude-haiku-3-5**: Fastest, good for simple tasks

### Start Chatting

Type a message and press Enter. Examples:

```
"Hello! Can you explain how Kubernetes Ingress works?"

"Write a Python function to reverse a string"

"Explain the difference between microservices and monoliths"
```

### View Chat History

- Conversations are saved automatically
- Click the history icon (left sidebar) to see past chats
- Storage is in PVC (persists across pod restarts)

## Configuration

### Add More Models

Edit `base/litellm/configmap.yaml`:

```yaml
model_list:
  # Add OpenAI models
  - model_name: gpt-4
    litellm_params:
      model: openai/gpt-4
      api_key: os.environ/OPENAI_API_KEY
```

Then update `overlays/phase1-kind/secrets.yaml` to add `OPENAI_API_KEY`.

Redeploy:
```bash
make phase1-deploy
```

### Adjust Resource Limits

Edit `base/open-webui/deployment.yaml` or `base/litellm/deployment.yaml`:

```yaml
resources:
  requests:
    cpu: 500m      # Increase if needed
    memory: 1Gi
  limits:
    cpu: 2000m
    memory: 2Gi
```

### Change Storage Size

Edit `overlays/phase1-kind/pvc-patch.yaml`:

```yaml
resources:
  requests:
    storage: 1Gi  # Increase for more chat history
```

## Troubleshooting

### Issue: Pods stuck in Pending

**Symptom**:
```bash
kubectl get pods -n openwebui
NAME                       READY   STATUS    RESTARTS   AGE
openwebui-xxxxx            0/1     Pending   0          5m
```

**Solution**:
```bash
# Check events
kubectl describe pod -n openwebui openwebui-xxxxx

# Common causes:
# 1. PVC not binding - check storage class exists
kubectl get sc

# 2. Resource constraints - check node resources
kubectl top nodes
```

### Issue: LiteLLM returns 401 Unauthorized

**Symptom**: Chat messages fail with "API key invalid"

**Solution**:
```bash
# Verify secret exists
kubectl get secret litellm-secrets -n openwebui

# Check secret value (base64 encoded)
kubectl get secret litellm-secrets -n openwebui -o jsonpath='{.data.ANTHROPIC_API_KEY}' | base64 -d
# Should show: sk-ant-api01-...

# If wrong, update .env file and redeploy
cd overlays/phase1-kind
# Edit .env with correct API key
make phase1-deploy
```

### Issue: Ingress returns 404

**Symptom**: `curl http://ambient.local/chat` returns 404

**Solution**:
```bash
# Check ingress exists
kubectl get ingress -n openwebui

# Check ingress-nginx logs
kubectl logs -n ingress-nginx deployment/ingress-nginx-controller

# Verify ambient.local in /etc/hosts
grep ambient.local /etc/hosts
# Should show: 127.0.0.1 ambient.local

# If using Podman, try port 8080
curl http://ambient.local:8080/chat
```

### Issue: Open WebUI loads but can't connect to LiteLLM

**Symptom**: UI loads, but sending messages fails

**Solution**:
```bash
# Test LiteLLM from Open WebUI pod
kubectl exec -n openwebui deployment/openwebui -- \
  curl http://litellm-service:4000/health

# Should return: {"status": "healthy"}

# If fails, check LiteLLM logs
kubectl logs -n openwebui deployment/litellm
```

### Issue: Chat messages timeout

**Symptom**: Messages take >60s and fail

**Solution**:
```bash
# Check LiteLLM logs for errors
kubectl logs -n openwebui deployment/litellm -f

# Test Anthropic API directly from LiteLLM pod
kubectl exec -n openwebui deployment/litellm -- \
  curl -s https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-3-haiku-20240307","max_tokens":10,"messages":[{"role":"user","content":"test"}]}'

# If this works, issue is with LiteLLM config or Open WebUI connection
```

## Advanced Usage

### Port Forwarding (Alternative Access)

If ingress is not working:

```bash
make phase1-port-forward
# Access at: http://localhost:8080
```

### Shell Access

```bash
# Open shell in Open WebUI pod
make phase1-shell-webui

# Open shell in LiteLLM pod
make phase1-shell-litellm
```

### View Real-time Logs

```bash
# Terminal 1: Open WebUI logs
make phase1-logs

# Terminal 2: LiteLLM logs
make phase1-logs-litellm
```

## Clean Up

### Remove Deployment (Keep Namespace)

```bash
make phase1-clean
```

### Remove Everything (Including Namespace)

```bash
make phase1-clean
kubectl delete namespace openwebui
```

### Reset and Redeploy

```bash
# Full reset
make phase1-clean
make phase1-deploy
```

## Next Steps

1. **Test different models**: Try claude-haiku-3-5 for speed
2. **Explore Open WebUI**: Settings → Models, System Prompts, etc.
3. **Monitor resources**: `kubectl top pods -n openwebui`
4. **For production**: Consider the main [Ambient Code Platform](../../../README.md) for enterprise features

## Security Notes

**⚠️ This deployment is for development/testing only:**

- No authentication (anyone with network access can use UI)
- API keys in Kubernetes Secrets (base64, not encrypted at rest)
- No network policies (pods can access any external service)
- No resource quotas (can consume unlimited cluster resources)

**Do NOT use in production**. For production deployments, use the main [Ambient Code Platform](../../../README.md).

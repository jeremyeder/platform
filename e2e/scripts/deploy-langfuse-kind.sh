#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "======================================"
echo "Deploying Langfuse to kind cluster"
echo "======================================"

# Detect container engine first (needed for kind cluster check)
CONTAINER_ENGINE="${CONTAINER_ENGINE:-}"

if [ -z "$CONTAINER_ENGINE" ]; then
  if command -v docker &> /dev/null && docker ps &> /dev/null 2>&1; then
    CONTAINER_ENGINE="docker"
  elif command -v podman &> /dev/null && podman ps &> /dev/null 2>&1; then
    CONTAINER_ENGINE="podman"
  else
    echo "❌ Neither Docker nor Podman found or running"
    exit 1
  fi
fi

# Set KIND_EXPERIMENTAL_PROVIDER if using Podman (needed before kind commands)
if [ "$CONTAINER_ENGINE" = "podman" ]; then
  export KIND_EXPERIMENTAL_PROVIDER=podman
fi

echo "Using container runtime: $CONTAINER_ENGINE"
echo ""

# Check if kind cluster exists
if ! kind get clusters 2>/dev/null | grep -q "^vteam-e2e$"; then
  echo "❌ Kind cluster 'vteam-e2e' not found"
  echo "   Run './scripts/setup-kind.sh' first"
  exit 1
fi

# Check prerequisites
if ! command -v helm &> /dev/null; then
  echo "❌ Helm not found. Please install Helm 3.x first."
  echo "   Visit: https://helm.sh/docs/intro/install/"
  exit 1
fi

if ! command -v kubectl &> /dev/null; then
  echo "❌ kubectl not found. Please install kubectl first."
  exit 1
fi

# Generate secure secrets
echo "Generating secure secrets..."
NEXTAUTH_SECRET=$(openssl rand -base64 32)
SALT=$(openssl rand -base64 32)
POSTGRES_PASSWORD=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32)
CLICKHOUSE_PASSWORD=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32)
REDIS_PASSWORD=$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | head -c 32)
echo "   ✓ Secrets generated"

# Add Langfuse Helm repository
echo ""
echo "Adding Langfuse Helm repository..."
helm repo add langfuse https://langfuse.github.io/langfuse-k8s &>/dev/null || true
helm repo update &>/dev/null
echo "   ✓ Helm repository updated"

# Create namespace
echo ""
echo "Creating namespace 'langfuse'..."
if kubectl get namespace langfuse &>/dev/null; then
  echo "   ℹ️ Namespace 'langfuse' already exists"
else
  kubectl create namespace langfuse
  echo "   ✓ Namespace created"
fi

# Install or upgrade Langfuse
echo ""
echo "Installing Langfuse..."
helm upgrade --install langfuse langfuse/langfuse \
  --namespace langfuse \
  --set langfuse.nextauth.secret.value="$NEXTAUTH_SECRET" \
  --set langfuse.salt.value="$SALT" \
  --set postgresql.auth.password="$POSTGRES_PASSWORD" \
  --set clickhouse.auth.password="$CLICKHOUSE_PASSWORD" \
  --set redis.auth.password="$REDIS_PASSWORD" \
  --set ingress.enabled=true \
  --set ingress.className=nginx \
  --set ingress.hosts[0].host=langfuse.local \
  --set ingress.hosts[0].paths[0].path=/ \
  --set ingress.hosts[0].paths[0].pathType=Prefix \
  --set resources.limits.cpu=1000m \
  --set resources.limits.memory=2Gi \
  --set resources.requests.cpu=500m \
  --set resources.requests.memory=1Gi \
  --wait \
  --timeout=10m

echo "   ✓ Langfuse installed"

# Wait for all pods to be ready
echo ""
echo "⏳ Waiting for Langfuse pods to be ready..."

# Wait for each component
for deployment in langfuse-web langfuse-worker; do
  if kubectl get deployment $deployment -n langfuse &>/dev/null; then
    kubectl wait --namespace langfuse \
      --for=condition=available \
      --timeout=300s \
      deployment/$deployment &>/dev/null || true
  fi
done

# Wait for StatefulSets
for statefulset in langfuse-postgresql langfuse-clickhouse langfuse-redis langfuse-zookeeper; do
  if kubectl get statefulset $statefulset -n langfuse &>/dev/null; then
    kubectl wait --namespace langfuse \
      --for=jsonpath='{.status.readyReplicas}'=1 \
      --timeout=300s \
      statefulset/$statefulset &>/dev/null || true
  fi
done

echo "   ✓ All pods ready"

# Add langfuse.local to /etc/hosts
echo ""
echo "Adding langfuse.local to /etc/hosts..."
if grep -q "langfuse.local" /etc/hosts 2>/dev/null; then
  echo "   ℹ️ langfuse.local already in /etc/hosts"
else
  if echo "127.0.0.1 langfuse.local" | sudo tee -a /etc/hosts > /dev/null 2>&1; then
    echo "   ✓ Added langfuse.local to /etc/hosts"
  else
    echo "   ⚠️ Warning: Could not modify /etc/hosts (sudo required)"
    echo "   Please add manually: echo '127.0.0.1 langfuse.local' | sudo tee -a /etc/hosts"
  fi
fi

# Save credentials
echo ""
echo "Saving credentials to .env.langfuse..."
cat > .env.langfuse <<EOF
# Langfuse Credentials
NEXTAUTH_SECRET=$NEXTAUTH_SECRET
SALT=$SALT
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
CLICKHOUSE_PASSWORD=$CLICKHOUSE_PASSWORD
REDIS_PASSWORD=$REDIS_PASSWORD
LANGFUSE_URL=http://langfuse.local
EOF
echo "   ✓ Credentials saved to e2e/.env.langfuse"

# Print status
echo ""
echo "======================================"
echo "✅ Langfuse deployment complete!"
echo "======================================"
echo ""
echo "Access Langfuse:"
echo "   URL: http://langfuse.local"
echo ""
echo "Credentials saved to:"
echo "   e2e/.env.langfuse"
echo ""
echo "Check deployment status:"
echo "   kubectl get pods -n langfuse"
echo "   kubectl get svc -n langfuse"
echo "   kubectl get ingress -n langfuse"
echo ""
echo "View logs:"
echo "   kubectl logs -n langfuse -l app.kubernetes.io/name=langfuse --tail=50"
echo ""
echo "Cleanup:"
echo "   kubectl delete namespace langfuse"
echo ""

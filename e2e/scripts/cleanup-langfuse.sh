#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "======================================"
echo "Cleaning up Langfuse deployment"
echo "======================================"

# Detect container runtime (same logic as other scripts)
CONTAINER_ENGINE="${CONTAINER_ENGINE:-}"

if [ -z "$CONTAINER_ENGINE" ]; then
  if command -v docker &> /dev/null && docker ps &> /dev/null 2>&1; then
    CONTAINER_ENGINE="docker"
  elif command -v podman &> /dev/null && podman ps &> /dev/null 2>&1; then
    CONTAINER_ENGINE="podman"
  fi
fi

# Set KIND_EXPERIMENTAL_PROVIDER if using Podman
if [ "$CONTAINER_ENGINE" = "podman" ]; then
  export KIND_EXPERIMENTAL_PROVIDER=podman
fi

# Check if --delete-cluster flag is provided
DELETE_CLUSTER=false
if [ "${1:-}" = "--delete-cluster" ]; then
  DELETE_CLUSTER=true
fi

echo ""
echo "Deleting Langfuse namespace..."
if kubectl get namespace langfuse &>/dev/null; then
  kubectl delete namespace langfuse
  echo "   ✓ Namespace 'langfuse' deleted"
else
  echo "   ℹ️  Namespace 'langfuse' not found (already deleted?)"
fi

echo ""
echo "Removing /etc/hosts entry..."
if grep -q "langfuse.local" /etc/hosts 2>/dev/null; then
  # Create backup
  sudo cp /etc/hosts /etc/hosts.bak.$(date +%Y%m%d_%H%M%S)
  # Remove the entry
  sudo sed -i.bak '/langfuse.local/d' /etc/hosts
  echo "   ✓ Removed langfuse.local from /etc/hosts"
  echo "   ℹ️  Backup created"
else
  echo "   ℹ️  langfuse.local not found in /etc/hosts"
fi

echo ""
echo "Cleaning up credentials file..."
if [ -f .env.langfuse ]; then
  rm .env.langfuse
  echo "   ✓ Removed .env.langfuse"
else
  echo "   ℹ️  .env.langfuse not found"
fi

# Optionally delete the kind cluster
if [ "$DELETE_CLUSTER" = true ]; then
  echo ""
  echo "Deleting kind cluster..."
  if kind get clusters 2>/dev/null | grep -q "^vteam-e2e$"; then
    kind delete cluster --name vteam-e2e
    echo "   ✓ Cluster deleted"
  else
    echo "   ℹ️  Cluster 'vteam-e2e' not found (already deleted?)"
  fi
fi

echo ""
echo "✅ Langfuse cleanup complete!"
if [ "$DELETE_CLUSTER" = false ]; then
  echo ""
  echo "   ℹ️  Kind cluster still running (use --delete-cluster to remove)"
fi
echo ""

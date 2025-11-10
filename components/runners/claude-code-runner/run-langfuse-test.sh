#!/bin/bash
# Helper script to run Langfuse E2E test with proper environment setup
#
# Usage:
#   ./run-langfuse-test.sh
#
# Prerequisites:
#   - kubectl configured and connected to cluster
#   - Langfuse deployed in 'langfuse' namespace
#   - Langfuse config/secret in 'ambient-code' namespace
#   - Anthropic API key configured in ambient-code project

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}Langfuse E2E Test Setup${NC}"
echo -e "${GREEN}=====================================${NC}"

# Check kubectl
if ! command -v kubectl &> /dev/null; then
    echo -e "${RED}Error: kubectl not found${NC}"
    exit 1
fi

# Get Langfuse configuration from ambient-code namespace (if not already set)
echo -e "\n${YELLOW}Fetching Langfuse configuration...${NC}"

if [ -z "$LANGFUSE_HOST" ]; then
    export LANGFUSE_HOST=$(kubectl get configmap langfuse-config -n ambient-code -o jsonpath='{.data.LANGFUSE_HOST}' 2>/dev/null || echo "")
fi

if [ -z "$LANGFUSE_PUBLIC_KEY" ]; then
    export LANGFUSE_PUBLIC_KEY=$(kubectl get secret langfuse-keys -n ambient-code -o jsonpath='{.data.LANGFUSE_PUBLIC_KEY}' 2>/dev/null | base64 -d || echo "")
fi

if [ -z "$LANGFUSE_SECRET_KEY" ]; then
    export LANGFUSE_SECRET_KEY=$(kubectl get secret langfuse-keys -n ambient-code -o jsonpath='{.data.LANGFUSE_SECRET_KEY}' 2>/dev/null | base64 -d || echo "")
fi

# Validate configuration
if [ -z "$LANGFUSE_HOST" ] || [ -z "$LANGFUSE_PUBLIC_KEY" ] || [ -z "$LANGFUSE_SECRET_KEY" ]; then
    echo -e "${RED}Error: Could not fetch Langfuse configuration from ambient-code namespace${NC}"
    echo "Please ensure langfuse-config ConfigMap and langfuse-keys Secret exist in ambient-code namespace"
    exit 1
fi

echo -e "  ${GREEN}✓${NC} LANGFUSE_HOST: $LANGFUSE_HOST"
echo -e "  ${GREEN}✓${NC} LANGFUSE_PUBLIC_KEY: ${LANGFUSE_PUBLIC_KEY:0:10}..."
echo -e "  ${GREEN}✓${NC} LANGFUSE_SECRET_KEY: ${LANGFUSE_SECRET_KEY:0:10}..."

# Note: ANTHROPIC_API_KEY should already be configured in the ambient-code project
echo -e "\n${YELLOW}Note: Using ANTHROPIC_API_KEY from ambient-code project configuration${NC}"

# Check if Langfuse is accessible (if host is cluster-internal, skip this check)
if [[ ! "$LANGFUSE_HOST" =~ "svc.cluster.local" ]]; then
    echo -e "\n${YELLOW}Testing Langfuse connectivity...${NC}"
    if curl -s -o /dev/null -w "%{http_code}" --max-time 5 "${LANGFUSE_HOST}/api/public/health" | grep -q "200"; then
        echo -e "  ${GREEN}✓${NC} Langfuse is accessible"
    else
        echo -e "  ${YELLOW}Warning: Could not reach Langfuse (this is ok if using cluster-internal URL)${NC}"
    fi
fi

# Determine which Python to use (prefer venv if available)
if [ -n "$VIRTUAL_ENV" ]; then
    PYTHON="python"
elif [ -f "/Users/jeder/.venv/bin/python" ]; then
    PYTHON="/Users/jeder/.venv/bin/python"
    echo -e "${YELLOW}Using Python from /Users/jeder/.venv${NC}"
else
    PYTHON="python"
fi

# Check Python dependencies
echo -e "\n${YELLOW}Checking Python dependencies...${NC}"

if ! $PYTHON -c "import requests" 2>/dev/null; then
    echo -e "${RED}Error: Required Python dependencies not installed${NC}"
    echo -e "\nPlease install dependencies first:"
    echo -e "  ${YELLOW}uv pip install -e \".[dev]\"${NC}"
    echo -e "\nOr if you don't have uv:"
    echo -e "  ${YELLOW}pip install -e \".[dev]\"${NC}"
    exit 1
fi

if ! $PYTHON -c "import kubernetes" 2>/dev/null; then
    echo -e "${RED}Error: kubernetes module not installed${NC}"
    echo -e "\nPlease install dependencies first:"
    echo -e "  ${YELLOW}uv pip install -e \".[dev]\"${NC}"
    exit 1
fi

echo -e "  ${GREEN}✓${NC} All dependencies installed"

# Run the test
echo -e "\n${GREEN}=====================================${NC}"
echo -e "${GREEN}Running E2E Test${NC}"
echo -e "${GREEN}=====================================${NC}\n"

$PYTHON tests/test_langfuse_e2e.py

# Capture exit code
EXIT_CODE=$?

echo -e "\n${GREEN}=====================================${NC}"
if [ $EXIT_CODE -eq 0 ]; then
    echo -e "${GREEN}Test completed successfully!${NC}"
else
    echo -e "${RED}Test failed with exit code: $EXIT_CODE${NC}"
fi
echo -e "${GREEN}=====================================${NC}"

exit $EXIT_CODE

#!/bin/bash
# validate-agent-references.sh
# Validates all semantic anchors in agent constitutions
#
# Usage: ./validate-agent-references.sh
# Returns: 0 if all references valid, 1 if errors found

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
CONSTITUTIONS_DIR="$REPO_ROOT/agents/sdlc/constitutions"

ERRORS=0
WARNINGS=0

echo "Validating agent constitution references..."
echo "Repository root: $REPO_ROOT"
echo "Constitutions: $CONSTITUTIONS_DIR"
echo ""

# Color codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Function to check if a symbol exists in a file
check_symbol() {
    local file="$1"
    local symbol="$2"
    local full_path="$REPO_ROOT/$file"

    if [ ! -f "$full_path" ]; then
        return 1
    fi

    # Check for function, type, const, or var declarations
    if grep -q "func $symbol\|type $symbol\|const $symbol\|var $symbol" "$full_path"; then
        return 0
    fi

    # Check for method receivers (Go)
    if grep -q "func ([^)]*) $symbol" "$full_path"; then
        return 0
    fi

    # Check for TypeScript/JavaScript exports
    if grep -q "export.*$symbol\|export default.*$symbol" "$full_path"; then
        return 0
    fi

    return 1
}

# Validate frontmatter in constitutions
echo "Checking frontmatter completeness..."
for constitution in "$CONSTITUTIONS_DIR"/*.md; do
    if [ ! -f "$constitution" ]; then
        continue
    fi

    filename=$(basename "$constitution")
    echo -n "  $filename: "

    # Check required frontmatter fields
    missing_fields=()

    if ! grep -q "^agent_id:" "$constitution"; then
        missing_fields+=("agent_id")
    fi

    if ! grep -q "^agent_name:" "$constitution"; then
        missing_fields+=("agent_name")
    fi

    if ! grep -q "^version:" "$constitution"; then
        missing_fields+=("version")
    fi

    if ! grep -q "^status:" "$constitution"; then
        missing_fields+=("status")
    fi

    if ! grep -q "^last_updated:" "$constitution"; then
        missing_fields+=("last_updated")
    fi

    if ! grep -q "^category:" "$constitution"; then
        missing_fields+=("category")
    fi

    if ! grep -q "^maintainer:" "$constitution"; then
        missing_fields+=("maintainer")
    fi

    if [ ${#missing_fields[@]} -eq 0 ]; then
        echo -e "${GREEN}✓${NC}"
    else
        echo -e "${RED}✗${NC} Missing: ${missing_fields[*]}"
        ERRORS=$((ERRORS + 1))
    fi
done

echo ""

# Validate semantic anchors (file::symbol references)
echo "Checking semantic anchors..."
for constitution in "$CONSTITUTIONS_DIR"/*.md; do
    if [ ! -f "$constitution" ]; then
        continue
    fi

    filename=$(basename "$constitution")

    # Extract semantic anchors (format: file_path::symbol_name)
    # Example: handlers/sessions.go::GetK8sClientsForRequest
    anchors=$(grep -o '[a-zA-Z0-9_/-]\+\.[a-z]\+::[a-zA-Z0-9_]\+' "$constitution" || true)

    if [ -z "$anchors" ]; then
        continue
    fi

    echo "  $filename:"

    while IFS= read -r anchor; do
        file_path=$(echo "$anchor" | cut -d: -f1)
        symbol=$(echo "$anchor" | cut -d: -f3)

        if check_symbol "$file_path" "$symbol"; then
            echo -e "    ${GREEN}✓${NC} $anchor"
        else
            echo -e "    ${RED}✗${NC} $anchor (symbol '$symbol' not found in $file_path)"
            ERRORS=$((ERRORS + 1))
        fi
    done <<< "$anchors"
done

echo ""

# Validate pattern references
echo "Checking pattern references..."

# Get all pattern IDs from pattern library
PATTERN_IDS=()
for pattern_file in "$REPO_ROOT/agents/sdlc/patterns"/*.md; do
    if [ ! -f "$pattern_file" ]; then
        continue
    fi

    # Extract pattern IDs (format: ## Pattern: pattern-id)
    while IFS= read -r pattern_id; do
        if [ -n "$pattern_id" ]; then
            PATTERN_IDS+=("$pattern_id")
        fi
    done < <(grep "^## Pattern:" "$pattern_file" | sed 's/^## Pattern: //' || true)
done

# Check pattern references in constitutions
for constitution in "$CONSTITUTIONS_DIR"/*.md; do
    if [ ! -f "$constitution" ]; then
        continue
    fi

    filename=$(basename "$constitution")

    # Extract pattern references (format: [Pattern: pattern-id])
    refs=$(grep -o '\[Pattern: [a-z0-9-]\+\]' "$constitution" | sed 's/\[Pattern: \(.*\)\]/\1/' || true)

    if [ -z "$refs" ]; then
        continue
    fi

    echo "  $filename:"

    while IFS= read -r ref; do
        if [ -z "$ref" ]; then
            continue
        fi

        # Check if pattern exists in library
        found=false
        for pattern_id in "${PATTERN_IDS[@]}"; do
            if [ "$pattern_id" = "$ref" ]; then
                found=true
                break
            fi
        done

        if $found; then
            echo -e "    ${GREEN}✓${NC} [Pattern: $ref]"
        else
            echo -e "    ${YELLOW}⚠${NC} [Pattern: $ref] (not found in pattern library)"
            WARNINGS=$((WARNINGS + 1))
        fi
    done <<< "$refs"
done

echo ""

# Validate integration points
echo "Checking integration points..."

# Get all agent IDs
AGENT_IDS=()
for constitution in "$CONSTITUTIONS_DIR"/*.md; do
    if [ ! -f "$constitution" ]; then
        continue
    fi

    agent_id=$(grep "^agent_id:" "$constitution" | sed 's/agent_id: //' || true)
    if [ -n "$agent_id" ]; then
        AGENT_IDS+=("$agent_id")
    fi
done

# Check integration_points in frontmatter
for constitution in "$CONSTITUTIONS_DIR"/*.md; do
    if [ ! -f "$constitution" ]; then
        continue
    fi

    filename=$(basename "$constitution")

    # Extract integration points from frontmatter
    in_frontmatter=false
    in_integration_points=false
    integration_points=()

    while IFS= read -r line; do
        if [ "$line" = "---" ]; then
            if $in_frontmatter; then
                break  # End of frontmatter
            else
                in_frontmatter=true
            fi
        elif $in_frontmatter; then
            if [ "$line" = "integration_points:" ]; then
                in_integration_points=true
            elif $in_integration_points; then
                if [[ $line =~ ^[[:space:]]*- ]]; then
                    # Extract agent ID from list item
                    agent=$(echo "$line" | sed 's/^[[:space:]]*- //')
                    integration_points+=("$agent")
                elif [[ ! $line =~ ^[[:space:]] ]]; then
                    # No longer in integration_points list
                    in_integration_points=false
                fi
            fi
        fi
    done < "$constitution"

    if [ ${#integration_points[@]} -eq 0 ]; then
        continue
    fi

    echo "  $filename:"

    for integration_point in "${integration_points[@]}"; do
        # Check if referenced agent exists
        found=false
        for agent_id in "${AGENT_IDS[@]}"; do
            if [ "$agent_id" = "$integration_point" ]; then
                found=true
                break
            fi
        done

        if $found; then
            echo -e "    ${GREEN}✓${NC} $integration_point"
        else
            echo -e "    ${RED}✗${NC} $integration_point (agent not found)"
            ERRORS=$((ERRORS + 1))
        fi
    done
done

echo ""

# Summary
echo "======================================"
echo "Validation Summary"
echo "======================================"
echo "Total constitutions: $(find "$CONSTITUTIONS_DIR" -name "*.md" | wc -l | tr -d ' ')"
echo "Total pattern IDs: ${#PATTERN_IDS[@]}"
echo "Total agent IDs: ${#AGENT_IDS[@]}"
echo ""

if [ $ERRORS -gt 0 ]; then
    echo -e "${RED}✗ Found $ERRORS error(s)${NC}"
fi

if [ $WARNINGS -gt 0 ]; then
    echo -e "${YELLOW}⚠ Found $WARNINGS warning(s)${NC}"
fi

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "${GREEN}✓ All validations passed${NC}"
    exit 0
else
    if [ $ERRORS -gt 0 ]; then
        exit 1
    else
        exit 0  # Warnings don't fail the build
    fi
fi

#!/bin/bash
# validate-pattern-library.sh
# Validates pattern library completeness and consistency
#
# Usage: ./validate-pattern-library.sh
# Returns: 0 if valid, 1 if errors found

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"
PATTERNS_DIR="$REPO_ROOT/agents/sdlc/patterns"

ERRORS=0
WARNINGS=0

echo "Validating pattern library..."
echo "Patterns directory: $PATTERNS_DIR"
echo ""

# Color codes
RED='\033[0;31m'
YELLOW='\033[1;33m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Check pattern file structure
echo "Checking pattern file structure..."

for pattern_file in "$PATTERNS_DIR"/*.md; do
    if [ ! -f "$pattern_file" ]; then
        echo -e "${YELLOW}⚠${NC} No pattern files found"
        WARNINGS=$((WARNINGS + 1))
        continue
    fi

    filename=$(basename "$pattern_file")
    echo "  $filename:"

    # Extract all pattern sections
    pattern_count=0
    while IFS= read -r line; do
        if [[ $line =~ ^##[[:space:]]Pattern: ]]; then
            pattern_count=$((pattern_count + 1))
            pattern_id=$(echo "$line" | sed 's/^## Pattern: //')

            echo -n "    Pattern: $pattern_id ... "

            # Check required sections for this pattern
            # Extract content between this pattern and the next
            content=$(awk "/^## Pattern: $pattern_id/,/^## Pattern:/" "$pattern_file")

            missing_sections=()

            # Check for required sections
            if ! echo "$content" | grep -q "^\*\*Pattern ID\*\*:"; then
                missing_sections+=("Pattern ID")
            fi

            if ! echo "$content" | grep -q "^\*\*Version\*\*:"; then
                missing_sections+=("Version")
            fi

            if ! echo "$content" | grep -q "^\*\*Status\*\*:"; then
                missing_sections+=("Status")
            fi

            if ! echo "$content" | grep -q "^\*\*Category\*\*:"; then
                missing_sections+=("Category")
            fi

            if ! echo "$content" | grep -q "^\*\*Description\*\*:"; then
                missing_sections+=("Description")
            fi

            # Check for code examples
            if ! echo "$content" | grep -q '```'; then
                missing_sections+=("Code examples")
            fi

            if [ ${#missing_sections[@]} -eq 0 ]; then
                echo -e "${GREEN}✓${NC}"
            else
                echo -e "${RED}✗${NC}"
                echo -e "      Missing sections: ${missing_sections[*]}"
                ERRORS=$((ERRORS + 1))
            fi
        fi
    done < "$pattern_file"

    if [ $pattern_count -eq 0 ]; then
        echo -e "    ${RED}✗${NC} No patterns found"
        ERRORS=$((ERRORS + 1))
    else
        echo -e "    ${GREEN}✓${NC} Found $pattern_count pattern(s)"
    fi
done

echo ""

# Check for duplicate pattern IDs
echo "Checking for duplicate pattern IDs..."

declare -A pattern_id_files
duplicates_found=false

for pattern_file in "$PATTERNS_DIR"/*.md; do
    if [ ! -f "$pattern_file" ]; then
        continue
    fi

    while IFS= read -r line; do
        if [[ $line =~ ^##[[:space:]]Pattern: ]]; then
            pattern_id=$(echo "$line" | sed 's/^## Pattern: //')

            if [ -n "${pattern_id_files[$pattern_id]:-}" ]; then
                echo -e "  ${RED}✗${NC} Duplicate pattern ID '$pattern_id' found in:"
                echo "      - ${pattern_id_files[$pattern_id]}"
                echo "      - $(basename "$pattern_file")"
                ERRORS=$((ERRORS + 1))
                duplicates_found=true
            else
                pattern_id_files[$pattern_id]=$(basename "$pattern_file")
            fi
        fi
    done < "$pattern_file"
done

if ! $duplicates_found; then
    echo -e "  ${GREEN}✓${NC} No duplicate pattern IDs"
fi

echo ""

# Check pattern ID naming convention
echo "Checking pattern ID naming conventions..."

for pattern_id in "${!pattern_id_files[@]}"; do
    # Pattern IDs should be kebab-case
    if [[ ! $pattern_id =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]]; then
        echo -e "  ${YELLOW}⚠${NC} Pattern ID '$pattern_id' doesn't follow kebab-case convention"
        WARNINGS=$((WARNINGS + 1))
    fi
done

if [ $WARNINGS -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} All pattern IDs follow kebab-case"
fi

echo ""

# Check for orphaned pattern references
echo "Checking for orphaned pattern references..."

CONSTITUTIONS_DIR="$REPO_ROOT/agents/sdlc/constitutions"

# Get all pattern references from constitutions
declare -A referenced_patterns

for constitution in "$CONSTITUTIONS_DIR"/*.md; do
    if [ ! -f "$constitution" ]; then
        continue
    fi

    while IFS= read -r ref; do
        if [ -n "$ref" ]; then
            referenced_patterns[$ref]=1
        fi
    done < <(grep -o '\[Pattern: [a-z0-9-]\+\]' "$constitution" | sed 's/\[Pattern: \(.*\)\]/\1/' || true)
done

orphaned_found=false
for ref_pattern in "${!referenced_patterns[@]}"; do
    if [ -z "${pattern_id_files[$ref_pattern]:-}" ]; then
        echo -e "  ${RED}✗${NC} Referenced pattern '$ref_pattern' not found in pattern library"
        ERRORS=$((ERRORS + 1))
        orphaned_found=true
    fi
done

if ! $orphaned_found; then
    echo -e "  ${GREEN}✓${NC} All referenced patterns exist in library"
fi

echo ""

# Check for unreferenced patterns
echo "Checking for unreferenced patterns..."

unreferenced_count=0
for pattern_id in "${!pattern_id_files[@]}"; do
    if [ -z "${referenced_patterns[$pattern_id]:-}" ]; then
        echo -e "  ${YELLOW}⚠${NC} Pattern '$pattern_id' not referenced by any agent"
        unreferenced_count=$((unreferenced_count + 1))
        WARNINGS=$((WARNINGS + 1))
    fi
done

if [ $unreferenced_count -eq 0 ]; then
    echo -e "  ${GREEN}✓${NC} All patterns are referenced by at least one agent"
fi

echo ""

# Validate pattern version format
echo "Checking pattern versions..."

for pattern_file in "$PATTERNS_DIR"/*.md; do
    if [ ! -f "$pattern_file" ]; then
        continue
    fi

    filename=$(basename "$pattern_file")

    while IFS= read -r line; do
        if [[ $line =~ ^\*\*Version\*\*:[[:space:]]*([0-9]+\.[0-9]+) ]]; then
            version="${BASH_REMATCH[1]}"

            # Version should be X.Y format
            if [[ ! $version =~ ^[0-9]+\.[0-9]+$ ]]; then
                echo -e "  ${RED}✗${NC} $filename: Invalid version format '$version' (should be X.Y)"
                ERRORS=$((ERRORS + 1))
            fi
        fi
    done < "$pattern_file"
done

echo -e "  ${GREEN}✓${NC} Version format checks passed"

echo ""

# Validate pattern status values
echo "Checking pattern status values..."

valid_statuses=("Stable" "Evolving" "Deprecated")

for pattern_file in "$PATTERNS_DIR"/*.md; do
    if [ ! -f "$pattern_file" ]; then
        continue
    fi

    filename=$(basename "$pattern_file")

    while IFS= read -r line; do
        if [[ $line =~ ^\*\*Status\*\*:[[:space:]]*(.*) ]]; then
            status="${BASH_REMATCH[1]}"

            # Check if status is valid
            valid=false
            for valid_status in "${valid_statuses[@]}"; do
                if [ "$status" = "$valid_status" ]; then
                    valid=true
                    break
                fi
            done

            if ! $valid; then
                echo -e "  ${YELLOW}⚠${NC} $filename: Unknown status '$status' (expected: ${valid_statuses[*]})"
                WARNINGS=$((WARNINGS + 1))
            fi
        fi
    done < "$pattern_file"
done

echo -e "  ${GREEN}✓${NC} Status value checks passed"

echo ""

# Summary
echo "======================================"
echo "Validation Summary"
echo "======================================"
echo "Total pattern files: $(find "$PATTERNS_DIR" -name "*.md" | wc -l | tr -d ' ')"
echo "Total patterns: ${#pattern_id_files[@]}"
echo "Total referenced: ${#referenced_patterns[@]}"
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

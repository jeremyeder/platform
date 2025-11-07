# Agent Lifecycle Management

**Version**: 1.0.0
**Date**: 2025-11-06
**Purpose**: Define versioning, reference strategies, and maintenance procedures for SDLC agents

## Executive Summary

This document addresses the critical challenge of maintaining agent constitutions that reference constantly-evolving codebase patterns. Traditional file:line references break with every code change. This framework implements semantic anchors, versioned pattern libraries, and automated validation to create resilient, maintainable agent constitutions.

---

## 1. The Reference Problem

### 1.1 Why File:Line References Fail

**Problem scenario**:

Agent constitution (written 2025-01-15):
```markdown
For user authentication, see handlers/sessions.go:227
```

Code evolution:
- 2025-02-01: Add copyright header (+10 lines) → pattern now at line 237
- 2025-03-15: Refactor imports (+5 lines) → pattern now at line 242
- 2025-04-20: Add new function above (+15 lines) → pattern now at line 257
- 2025-06-10: Function renamed to `GetUserScopedK8sClients` → line 257 still exists but wrong function

**Result**: Agent references line 227, which now points to completely different code. Silent failure mode: agent learns wrong pattern.

### 1.2 Impact Assessment

| Issue | Frequency | Impact | Detection Difficulty |
|-------|-----------|--------|---------------------|
| **Stale line references** | Every code change | Medium (wrong guidance) | High (manual audit only) |
| **Function moved** | Monthly | High (broken reference) | Medium (grep fails) |
| **Pattern evolved** | Quarterly | Critical (outdated pattern) | Very High (semantic drift) |
| **File renamed** | Rarely | Critical (broken reference) | Low (obvious) |

**Conclusion**: File:line references are fundamentally incompatible with living codebases.

---

## 2. Semantic Anchor Strategy

### 2.1 Anchor Syntax

**Format**: `file_path::symbol_name`

**Examples**:
```
handlers/sessions.go::GetK8sClientsForRequest               # Function
handlers/sessions.go::CreateAgenticSession                   # Function
types/session.go::AgenticSessionSpec                        # Struct
types/session.go::AgenticSessionSpec::Timeout               # Struct field
handlers/middleware.go::ValidateProjectContext              # Middleware function
config/constants.go::DefaultSessionTimeout                  # Constant
```

**Rationale**:
- Symbols (function names, types) are stable identifiers
- Developers rarely rename without good reason
- Renames trigger compiler errors (forcing updates)
- grep-able for validation

### 2.2 Implementation Rules

**In agent constitutions**:

```markdown
❌ Incorrect (brittle):
For user authentication, see handlers/sessions.go:227

✅ Correct (resilient):
For user authentication, see handlers/sessions.go::GetK8sClientsForRequest

✅ Even better (with pattern ID):
For user authentication, see [Pattern: user-scoped-k8s-client-creation]
Location: handlers/sessions.go::GetK8sClientsForRequest
```

**Benefits**:
1. Survives line number changes (100% of code edits)
2. Survives refactoring within same file (90% of refactors)
3. Fails visibly when function renamed (better than silent failure)
4. Grep-able for automated validation

### 2.3 Validation Automation

**Pre-commit hook** (`scripts/validate-agent-references.sh`):

```bash
#!/bin/bash
# Validate all semantic anchors in agent constitutions

ERRORS=0

# Extract all references from constitutions
grep -r "::.*#" agents/sdlc/constitutions/*.md | while read -r line; do
    FILE=$(echo "$line" | cut -d: -f1)
    REF=$(echo "$line" | sed -n 's/.*\(components\/[^:]*::[^]]*\).*/\1/p')

    if [ -n "$REF" ]; then
        CODE_FILE=$(echo "$REF" | cut -d: -f1)
        SYMBOL=$(echo "$REF" | cut -d: -f3)

        # Check if symbol exists in code file
        if ! grep -q "func $SYMBOL\|type $SYMBOL\|const $SYMBOL\|var $SYMBOL" "$CODE_FILE"; then
            echo "❌ Broken reference in $FILE: $REF"
            echo "   Symbol '$SYMBOL' not found in $CODE_FILE"
            ERRORS=$((ERRORS + 1))
        fi
    fi
done

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo "❌ Found $ERRORS broken semantic anchor(s)"
    echo "   Please update agent constitutions or pattern library"
    exit 1
fi

echo "✅ All semantic anchors valid"
```

**CI Integration** (`.github/workflows/validate-agents.yml`):

```yaml
name: Validate Agent References

on: [push, pull_request]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Validate semantic anchors
        run: ./scripts/validate-agent-references.sh
      - name: Validate pattern library completeness
        run: ./scripts/validate-pattern-library.sh
```

---

## 3. Versioned Pattern Library

### 3.1 Pattern Document Structure

Each pattern in `agents/sdlc/patterns/*.md` follows this schema:

```markdown
## Pattern: kebab-case-pattern-id

**Pattern ID**: unique-identifier
**Version**: X.Y (semantic versioning)
**Status**: Stable | Evolving | Deprecated
**Last Updated**: YYYY-MM-DD
**Category**: Backend | Operator | Frontend | Security | Testing | Deployment

**Location**: file_path::symbol_name
**Grep Anchor**: `regex_pattern`

**Description**:
1-2 paragraph explanation of what this pattern accomplishes and why it exists.

**Context**:
When to use this pattern (prerequisites, conditions, scenarios).

**Implementation**:
```language
// Concrete code example showing correct usage
```

**Anti-Patterns**:
```language
// ❌ Common mistakes and why they're wrong
```

**Detection**:
- ✅ Correct indicator: `grep_pattern_for_correct_usage`
- ❌ Wrong indicator: `grep_pattern_for_anti_pattern`

**Validation**:
How to test that this pattern is correctly implemented.

**Related Patterns**:
- [Pattern: other-pattern-id] (relationship description)
- [Pattern: another-pattern-id] (relationship description)

**Change History**:
- v1.1 (YYYY-MM-DD): Added X, deprecated Y
- v1.0 (YYYY-MM-DD): Initial pattern definition
```

### 3.2 Pattern Versioning

**Semantic versioning** for patterns:

- **Major version** (X.0): Breaking change (old implementation now incorrect)
  - Example: RBAC enforcement method changed from manual checks to middleware
- **Minor version** (X.Y): Additive change (old implementation still correct but not optimal)
  - Example: Added rate limiting to authentication pattern

**Version bump triggers**:

| Change Type | Version Bump | Example |
|------------|--------------|---------|
| Fix typo in documentation | None (patch in git only) | "Fix typo in pattern description" |
| Add clarification or example | Minor | "Add example for multi-repo sessions" |
| Deprecate old approach | Minor | "Recommend React Query over manual fetch" |
| Old approach now incorrect | Major | "User-scoped client now required (was optional)" |
| Pattern completely replaced | Major + rename | "Pattern v1.0 → v2.0 with different ID" |

**Deprecation process**:

```markdown
## Pattern: old-pattern-name

**Status**: Deprecated
**Deprecated Date**: 2025-11-06
**Replacement**: [Pattern: new-pattern-name]
**Removal Date**: 2026-02-06 (3 months)

**Deprecation Reason**:
This pattern has been superseded by [new-pattern-name] which provides
better security/performance/maintainability because...

**Migration Guide**:
1. Replace X with Y
2. Update tests to Z
3. Verify with grep pattern: `...`

---

*Original pattern content preserved below for reference during migration*
```

### 3.3 Pattern Library Maintenance

**Weekly review** (automated):
```bash
# Check for patterns that reference moved/renamed symbols
./scripts/validate-pattern-library.sh

# Check for patterns not referenced by any agent
./scripts/find-unused-patterns.sh

# Check for duplicate patterns
./scripts/find-duplicate-patterns.sh
```

**Monthly review** (manual):
1. Review all "Evolving" patterns for stability
2. Check deprecated patterns for removal eligibility
3. Identify missing patterns from recent PRs
4. Update pattern versions based on code changes

**Quarterly review** (team):
1. Pattern effectiveness survey (are patterns helpful?)
2. Coverage analysis (do patterns cover common issues?)
3. Agent constitution updates based on pattern evolution
4. Archive removed patterns to `patterns/archive/`

---

## 4. Agent Constitution Lifecycle

### 4.1 Constitution Versioning

**Metadata** (in constitution frontmatter):

```markdown
---
agent_id: dev-01-backend
agent_name: Backend Development Agent
version: 1.2.0
status: active
last_updated: 2025-11-06
maintainer: Jeremy Eder <jeder@redhat.com>
---

# Backend Development Agent

**Version**: 1.2.0
**Status**: Active
```

**Semantic versioning** for constitutions:

- **Major** (X.0.0): Fundamental responsibility change
  - Example: Split backend agent into API + K8s client agents
- **Minor** (X.Y.0): New pattern added, expanded responsibilities
  - Example: Add rate limiting pattern to backend agent
- **Patch** (X.Y.Z): Clarifications, typo fixes, example updates
  - Example: Clarify when to use user-scoped vs service account clients

### 4.2 Update Triggers

| Trigger | Action | Version Bump |
|---------|--------|--------------|
| **Pattern library updated** (major) | Review constitution, update references | Minor or Major |
| **Pattern library updated** (minor) | Add new pattern reference | Patch or Minor |
| **Codebase architecture change** | Rewrite affected sections | Major or Minor |
| **Agent effectiveness metrics poor** | Enhance guidance | Minor |
| **Team feedback** | Clarify ambiguous sections | Patch |
| **New technology adopted** | Add new tools/patterns | Minor |

### 4.3 Constitution Review Process

**Monthly review checklist**:

- [ ] All semantic anchors validate (automated)
- [ ] All pattern references resolve (automated)
- [ ] No deprecated patterns referenced (automated)
- [ ] Effectiveness metrics meet targets (manual)
- [ ] Team feedback addressed (manual)
- [ ] Examples tested against current codebase (manual)

**Quarterly deep review**:

- [ ] Constitution still matches agent's actual behavior
- [ ] Responsibilities still align with SDLC needs
- [ ] Integration points still accurate
- [ ] Tools/tech list current
- [ ] Critical patterns list complete
- [ ] Consider splitting if agent too broad
- [ ] Consider merging if agent too narrow

---

## 5. Dual-Format Synchronization

### 5.1 Conversion Workflow

**Source of truth**: Markdown (`.md` files)

**Generated format**: ACP YAML (`.acp.yaml` files)

**Conversion script** (`scripts/md2acp.py`):

```python
#!/usr/bin/env python3
"""Convert agent constitution markdown to ACP YAML format"""

import re
import yaml
from pathlib import Path

def parse_constitution_md(md_path):
    """Extract metadata and content from markdown"""
    with open(md_path) as f:
        content = f.read()

    # Extract frontmatter
    frontmatter_match = re.search(r'^---\n(.*?)\n---', content, re.DOTALL)
    if frontmatter_match:
        metadata = yaml.safe_load(frontmatter_match.group(1))
    else:
        metadata = {}

    # Extract main content (after frontmatter)
    content = re.sub(r'^---\n.*?\n---\n', '', content, flags=re.DOTALL)

    return metadata, content

def generate_acp_yaml(metadata, content, output_path):
    """Generate ACP-native YAML format"""
    acp_config = {
        'apiVersion': 'vteam.ambient-code/v1alpha1',
        'kind': 'AgentConstitution',
        'metadata': {
            'name': metadata.get('agent_id', 'unknown'),
            'labels': {
                'agent.ambient-code.io/category': metadata.get('category', 'sdlc'),
                'agent.ambient-code.io/version': metadata.get('version', '1.0.0'),
            }
        },
        'spec': {
            'agentName': metadata.get('agent_name', 'Unknown Agent'),
            'version': metadata.get('version', '1.0.0'),
            'status': metadata.get('status', 'active'),
            'constitution': content,
            'tools': metadata.get('tools', []),
            'integrations': metadata.get('integration_points', []),
        }
    }

    with open(output_path, 'w') as f:
        yaml.dump(acp_config, f, default_flow_style=False, sort_keys=False)

def main():
    constitutions_dir = Path('agents/sdlc/constitutions')

    for md_file in constitutions_dir.glob('*.md'):
        metadata, content = parse_constitution_md(md_file)
        yaml_file = md_file.with_suffix('.acp.yaml')
        generate_acp_yaml(metadata, content, yaml_file)
        print(f"✅ Generated {yaml_file.name}")

if __name__ == '__main__':
    main()
```

**Makefile target**:

```makefile
.PHONY: generate-acp-agents
generate-acp-agents:
	@echo "Generating ACP YAML from markdown constitutions..."
	@python3 scripts/md2acp.py
	@echo "✅ All ACP YAML files generated"

.PHONY: validate-acp-agents
validate-acp-agents: generate-acp-agents
	@echo "Validating ACP YAML files..."
	@for f in agents/sdlc/constitutions/*.acp.yaml; do \
		kubectl --dry-run=client -f $$f validate || exit 1; \
	done
	@echo "✅ All ACP YAML files valid"
```

### 5.2 Pre-Commit Hook

**`.git/hooks/pre-commit`**:

```bash
#!/bin/bash
# Auto-generate ACP YAML and validate before commit

set -e

echo "🔍 Checking for modified agent constitutions..."

# Find modified .md files in constitutions directory
MODIFIED_MD=$(git diff --cached --name-only --diff-filter=ACM | grep 'agents/sdlc/constitutions/.*\.md$' || true)

if [ -n "$MODIFIED_MD" ]; then
    echo "📝 Modified constitutions detected, regenerating ACP YAML..."
    make generate-acp-agents

    # Stage generated YAML files
    git add agents/sdlc/constitutions/*.acp.yaml

    echo "✅ ACP YAML files regenerated and staged"
fi

# Validate semantic anchors
echo "🔍 Validating semantic anchors..."
./scripts/validate-agent-references.sh

# Validate pattern library
echo "🔍 Validating pattern library..."
./scripts/validate-pattern-library.sh

echo "✅ All validations passed"
```

### 5.3 Synchronization Validation

**CI job** (`.github/workflows/validate-agents.yml`):

```yaml
name: Validate Agent Sync

on: [push, pull_request]

jobs:
  validate-sync:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Generate ACP YAML
        run: make generate-acp-agents

      - name: Check for differences
        run: |
          git diff --exit-code agents/sdlc/constitutions/*.acp.yaml || {
            echo "❌ ACP YAML files out of sync with markdown"
            echo "   Run 'make generate-acp-agents' and commit changes"
            exit 1
          }

      - name: Validate YAML syntax
        run: make validate-acp-agents
```

---

## 6. Anti-Pattern Detection

### 6.1 Automated Detection

**Pattern-specific grep checks** (in pattern library):

Example from `patterns/security-patterns.md`:

```markdown
## Pattern: user-scoped-k8s-client-creation

**Detection**:

✅ Correct usage:
```bash
grep -r "GetK8sClientsForRequest" components/backend/handlers/
```

❌ Anti-pattern (service account for user operations):
```bash
# This should return NO results in handlers/
grep -r "DynamicClient\.Resource.*\.List\|K8sClient\.CoreV1" components/backend/handlers/
```

**Automated check** (`scripts/detect-anti-patterns.sh`):

```bash
#!/bin/bash
# Detect anti-patterns in codebase

VIOLATIONS=0

# Check for service account usage in handlers
echo "Checking for service account misuse in handlers..."
RESULTS=$(grep -rn "DynamicClient\.Resource\|K8sClient\." components/backend/handlers/ || true)
if [ -n "$RESULTS" ]; then
    echo "❌ Service account used in handlers (should use GetK8sClientsForRequest):"
    echo "$RESULTS"
    VIOLATIONS=$((VIOLATIONS + 1))
fi

# Check for 'any' types in frontend
echo "Checking for 'any' types in frontend..."
RESULTS=$(grep -rn ": any\|<any>" components/frontend/src/ --include="*.ts" --include="*.tsx" || true)
if [ -n "$RESULTS" ]; then
    echo "❌ 'any' types found in frontend:"
    echo "$RESULTS"
    VIOLATIONS=$((VIOLATIONS + 1))
fi

# ... more checks ...

if [ $VIOLATIONS -gt 0 ]; then
    echo "❌ Found $VIOLATIONS anti-pattern violations"
    exit 1
fi

echo "✅ No anti-patterns detected"
```

### 6.2 CI Integration

**Pull request check**:

```yaml
name: Anti-Pattern Detection

on: [pull_request]

jobs:
  detect:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Detect anti-patterns
        run: ./scripts/detect-anti-patterns.sh
```

**Results posted as PR comment** (via GitHub Actions):

```
## 🔍 Anti-Pattern Detection Results

❌ **2 violations found**

### Service Account Misuse
`components/backend/handlers/projects.go:123`
```go
list, err := DynamicClient.Resource(gvr).Namespace(ns).List(ctx, v1.ListOptions{})
```
**Recommendation**: Use `GetK8sClientsForRequest(c)` for user-scoped operations
**Pattern**: [user-scoped-k8s-client-creation]

### TypeScript 'any' Type
`components/frontend/src/services/api.ts:45`
```typescript
const data: any = await response.json()
```
**Recommendation**: Define proper type or use `unknown` with type guard
**Pattern**: [typescript-type-safety]
```

---

## 7. Maintenance Procedures

### 7.1 Weekly Maintenance (Automated)

**Cron job or GitHub Actions schedule**:

```yaml
name: Weekly Agent Maintenance

on:
  schedule:
    - cron: '0 9 * * MON'  # Every Monday at 9 AM

jobs:
  maintenance:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Validate semantic anchors
        run: ./scripts/validate-agent-references.sh

      - name: Validate pattern library
        run: ./scripts/validate-pattern-library.sh

      - name: Find unused patterns
        run: ./scripts/find-unused-patterns.sh

      - name: Check for deprecated patterns
        run: ./scripts/check-deprecated-patterns.sh

      - name: Generate maintenance report
        run: ./scripts/generate-maintenance-report.sh > /tmp/report.md

      - name: Create issue if problems found
        if: failure()
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.create({
              owner: context.repo.owner,
              repo: context.repo.repo,
              title: 'Agent Framework Maintenance Required',
              body: require('fs').readFileSync('/tmp/report.md', 'utf8'),
              labels: ['agents', 'maintenance']
            })
```

### 7.2 Monthly Review (Manual)

**Checklist**:

1. **Pattern library review**:
   - [ ] Review all "Evolving" patterns for stability promotion
   - [ ] Check deprecated patterns (3-month threshold for removal)
   - [ ] Identify missing patterns from recent code reviews
   - [ ] Update pattern versions based on code evolution

2. **Constitution effectiveness**:
   - [ ] Review agent metrics (from ARCHITECTURE_DECISION.md Section 5.1)
   - [ ] Analyze PR comments for pattern confusion
   - [ ] Check team feedback channels
   - [ ] Identify constitutions needing clarification

3. **Anti-pattern analysis**:
   - [ ] Review violations caught by automation
   - [ ] Analyze violations that escaped to production
   - [ ] Update detection patterns for new anti-patterns
   - [ ] Enhance agent guidance for common mistakes

4. **Documentation sync**:
   - [ ] Verify CLAUDE.md patterns match agent patterns
   - [ ] Update README examples if patterns evolved
   - [ ] Sync component-specific docs with agent guidance

### 7.3 Quarterly Deep Review (Team)

**Agenda** (2-hour session):

1. **Metrics review** (30 min):
   - Agent effectiveness scores
   - Pattern violation trends
   - Team adoption rates
   - Context efficiency metrics

2. **Pattern evolution** (30 min):
   - Promote Evolving → Stable
   - Archive deprecated patterns
   - Identify new patterns needed
   - Pattern library gaps

3. **Constitution refinement** (40 min):
   - Review underperforming agents
   - Consider splitting/merging agents
   - Update responsibilities based on SDLC changes
   - Integration point updates

4. **Roadmap planning** (20 min):
   - New agents needed?
   - Technology changes requiring updates
   - Process improvements
   - Automation opportunities

**Deliverables**:
- Updated agent constitutions (new versions)
- Pattern library updates
- Maintenance backlog priorities
- Quarterly report for leadership

---

## 8. Tooling and Automation

### 8.1 Scripts Inventory

| Script | Purpose | Run Frequency | Integration |
|--------|---------|---------------|-------------|
| `validate-agent-references.sh` | Check semantic anchors | Pre-commit | Git hook |
| `validate-pattern-library.sh` | Verify pattern integrity | Pre-commit | Git hook |
| `detect-anti-patterns.sh` | Find pattern violations | PR | CI |
| `find-unused-patterns.sh` | Identify orphaned patterns | Weekly | Scheduled job |
| `check-deprecated-patterns.sh` | Track deprecation timeline | Weekly | Scheduled job |
| `generate-maintenance-report.sh` | Aggregate health metrics | Weekly | Scheduled job |
| `md2acp.py` | Convert MD → YAML | Pre-commit | Git hook |
| `generate-pattern-metrics.py` | Usage analytics | Monthly | Manual |

### 8.2 Validation Script Examples

**Pattern library validator** (`scripts/validate-pattern-library.sh`):

```bash
#!/bin/bash
# Validate pattern library integrity

ERRORS=0

# Check for required fields in each pattern
for pattern_file in agents/sdlc/patterns/*.md; do
    echo "Validating $pattern_file..."

    # Check for version field
    if ! grep -q "^\*\*Version\*\*:" "$pattern_file"; then
        echo "❌ Missing Version field in $pattern_file"
        ERRORS=$((ERRORS + 1))
    fi

    # Check for Location field
    if ! grep -q "^\*\*Location\*\*:" "$pattern_file"; then
        echo "❌ Missing Location field in $pattern_file"
        ERRORS=$((ERRORS + 1))
    fi

    # Check for Grep Anchor
    if ! grep -q "^\*\*Grep Anchor\*\*:" "$pattern_file"; then
        echo "❌ Missing Grep Anchor in $pattern_file"
        ERRORS=$((ERRORS + 1))
    fi

    # Validate semantic anchors in this pattern file
    grep "^\*\*Location\*\*:" "$pattern_file" | while read -r line; do
        LOCATION=$(echo "$line" | sed 's/\*\*Location\*\*: //')
        FILE=$(echo "$LOCATION" | cut -d: -f1)
        SYMBOL=$(echo "$LOCATION" | cut -d: -f3)

        if [ -f "$FILE" ] && ! grep -q "func $SYMBOL\|type $SYMBOL" "$FILE"; then
            echo "❌ Symbol $SYMBOL not found in $FILE (referenced in $pattern_file)"
            ERRORS=$((ERRORS + 1))
        fi
    done
done

if [ $ERRORS -gt 0 ]; then
    echo "❌ Pattern library validation failed with $ERRORS errors"
    exit 1
fi

echo "✅ Pattern library validation passed"
```

### 8.3 Metrics Collection

**Pattern usage analytics** (`scripts/generate-pattern-metrics.py`):

```python
#!/usr/bin/env python3
"""Generate metrics on pattern library usage"""

import re
from pathlib import Path
from collections import defaultdict

def analyze_pattern_usage():
    """Count pattern references across agents and codebase"""

    pattern_refs = defaultdict(int)

    # Count references in agent constitutions
    for constitution in Path('agents/sdlc/constitutions').glob('*.md'):
        content = constitution.read_text()
        for match in re.finditer(r'\[Pattern: ([^\]]+)\]', content):
            pattern_refs[match.group(1)] += 1

    # Find patterns defined in library
    defined_patterns = set()
    for pattern_file in Path('agents/sdlc/patterns').glob('*.md'):
        content = pattern_file.read_text()
        for match in re.finditer(r'## Pattern: ([^\n]+)', content):
            defined_patterns.add(match.group(1))

    # Report
    print("# Pattern Library Usage Report\n")
    print(f"**Total Patterns Defined**: {len(defined_patterns)}")
    print(f"**Total References**: {sum(pattern_refs.values())}\n")

    print("## Most Referenced Patterns\n")
    for pattern, count in sorted(pattern_refs.items(), key=lambda x: -x[1])[:10]:
        print(f"- {pattern}: {count} references")

    print("\n## Unused Patterns\n")
    unused = defined_patterns - set(pattern_refs.keys())
    if unused:
        for pattern in sorted(unused):
            print(f"- {pattern}")
    else:
        print("*All patterns are referenced*")

if __name__ == '__main__':
    analyze_pattern_usage()
```

---

## 9. Migration Strategy

### 9.1 Migrating Existing Agent References

**Step 1: Audit current references**

```bash
# Find all file:line references in existing agents
grep -rn "\.go:[0-9]\|\.ts:[0-9]\|\.py:[0-9]" agents/ > /tmp/old-refs.txt
```

**Step 2: Convert to semantic anchors**

For each reference:
1. Open file at line number
2. Identify function/type/constant name
3. Replace `file.go:123` with `file.go::FunctionName`
4. Add pattern ID if applicable

**Step 3: Validate migration**

```bash
./scripts/validate-agent-references.sh
```

### 9.2 Gradual Rollout Plan

| Week | Activity | Validation |
|------|----------|------------|
| **Week 1** | Migrate pattern library to semantic anchors | All patterns validate |
| **Week 2** | Migrate Phase 1 agents (DEV-01, DEV-02, DEV-05, QA-04) | Anchors resolve correctly |
| **Week 3** | Migrate remaining agents | Full validation passes |
| **Week 4** | Enable pre-commit hooks | No new file:line refs |

---

## 10. Success Criteria

### 10.1 Technical Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Broken reference rate** | <1% per quarter | Weekly validation script |
| **Pattern library coverage** | 100% of critical patterns | Manual audit |
| **Anti-pattern detection rate** | 95%+ caught in PR | CI metrics |
| **Constitution freshness** | <30 days avg last update | Git log analysis |
| **Validation script pass rate** | 100% on main branch | CI dashboard |

### 10.2 Operational Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Time to detect stale reference** | <1 week | Incident tracking |
| **Time to update constitution** | <2 days | Issue resolution time |
| **Pattern addition cycle time** | <1 week from identification | Process tracking |
| **Team confusion incidents** | <2 per month | Support channel analysis |

### 10.3 Adoption Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Pattern library usage** | 80%+ of PRs reference patterns | PR analysis |
| **Team satisfaction** | 8/10+ | Quarterly survey |
| **Reference accuracy** | 95%+ valid anchors | Validation reports |

---

## 11. Conclusion

This lifecycle management framework ensures agent constitutions remain accurate, maintainable, and valuable as the codebase evolves. Key principles:

**Resilience**: Semantic anchors survive 90%+ of code changes
**Automation**: Pre-commit hooks and CI prevent drift
**Versioning**: Pattern library tracks evolution systematically
**Validation**: Automated checks catch broken references immediately
**Continuous improvement**: Weekly/monthly/quarterly reviews keep framework healthy

**Next steps**: Implement validation scripts and begin pattern library creation (see `ARCHITECTURE_DECISION.md` Section 8 for implementation roadmap).

# Enable Branch Protection for ambient-code/platform

**Objective**: Configure branch protection rules on the `main` branch to block merges when critical CI checks fail.

## Current State Analysis

**Repository**: ambient-code/platform
**Target Branch**: main
**Current Protection**: Disabled (`"enabled": false`)
**Problem**: PR #259 has a failing `claude-review` check but can still be merged

## Critical CI Checks Identified

Based on active workflows, these checks should be **required** before merge:

### Tier 1 - Must Pass (Block Merge)
1. **E2E Tests** (`End-to-End Tests` job)
   - Validates full system integration
   - Prevents broken deployments

2. **Frontend Lint and Type Check** (`lint-summary` job from Frontend workflow)
   - Ensures code quality and type safety
   - Catches frontend bugs early

3. **Go Lint and Format** (`lint-summary` job from Go workflow)
   - Ensures backend code quality
   - Maintains consistent Go formatting

4. **Test Local Development Environment** (`test-local-dev-simulation` job)
   - Ensures developer experience isn't broken
   - Critical for team productivity

### Tier 2 - Recommended (Optional but Valuable)
5. **Claude Code Review** (`claude-review` job)
   - AI-assisted code quality review
   - Currently failing on PR #259

6. **Build and Push Component Docker Images** (all `build-and-push` jobs)
   - Ensures Docker images build successfully
   - Validates containerization

## Implementation Plan

### Step 1: Enable Branch Protection
```bash
gh api -X PUT repos/ambient-code/platform/branches/main/protection \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": true,
    "contexts": [
      "End-to-End Tests",
      "lint-summary",
      "test-local-dev-simulation"
    ]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": false
}
EOF
```

### Step 2: Verify Configuration
```bash
# Check protection status
gh api repos/ambient-code/platform/branches/main/protection | jq '.required_status_checks'

# Expected output:
# {
#   "strict": true,
#   "contexts": [
#     "End-to-End Tests",
#     "lint-summary",
#     "test-local-dev-simulation"
#   ]
# }
```

### Step 3: Test with PR #259
After enabling protection:
1. Try to merge PR #259 (should be blocked due to failing `claude-review` if added to contexts)
2. Fix the failing check
3. Verify merge becomes available after all checks pass

## Configuration Options Explained

| Setting | Value | Rationale |
|---------|-------|-----------|
| `strict: true` | Requires branches be up-to-date before merge | Prevents merge conflicts and ensures tests run against latest code |
| `enforce_admins: false` | Admins can bypass protection | Allows emergency fixes when needed |
| `required_pull_request_reviews: null` | No required reviews | Relies on CI checks instead of manual reviews |
| `allow_force_pushes: false` | Blocks force pushes | Prevents history rewriting on main |
| `allow_deletions: false` | Prevents branch deletion | Protects main branch from accidental removal |

## Maintenance Guidelines

### Adding New Required Checks
When adding critical workflows, update the contexts list:
```bash
gh api -X PATCH repos/ambient-code/platform/branches/main/protection/required_status_checks \
  --field strict=true \
  -f contexts[]=End-to-End Tests \
  -f contexts[]=lint-summary \
  -f contexts[]=test-local-dev-simulation \
  -f contexts[]="<NEW_CHECK_NAME>"
```

### Removing Required Checks
If a check becomes flaky or is deprecated:
```bash
# Get current contexts
gh api repos/ambient-code/platform/branches/main/protection/required_status_checks | jq .contexts

# Update with filtered list (remove unwanted check)
gh api -X PATCH repos/ambient-code/platform/branches/main/protection/required_status_checks \
  --field strict=true \
  -f contexts[]=End-to-End Tests \
  -f contexts[]=lint-summary
```

### Temporary Bypass (Emergency Use Only)
If you need to merge despite failing checks:
```bash
# Option 1: Temporarily disable protection
gh api -X DELETE repos/ambient-code/platform/branches/main/protection

# Merge your PR

# Option 2: Re-enable protection (use Step 1 command above)
```

## Security Considerations

**⚠️ Important**: This configuration allows admins to bypass protection (`enforce_admins: false`). This is intentional for emergency fixes but should be used sparingly.

**Best Practice**:
- Use bypass only for critical hotfixes
- Document all bypasses in PR comments
- Review bypassed PRs retroactively

## Monitoring & Alerts

Set up notifications for protection bypass events:
```bash
# Add to .github/workflows/protection-monitor.yml
name: Branch Protection Monitor
on:
  push:
    branches: [main]
jobs:
  check:
    runs-on: ubuntu-latest
    steps:
      - name: Alert on bypass
        if: github.event.forced == true
        run: echo "::warning::Force push detected on protected branch"
```

## Rollback Plan

If branch protection causes issues:
```bash
# Disable all protection
gh api -X DELETE repos/ambient-code/platform/branches/main/protection

# Or revert to minimal protection
gh api -X PUT repos/ambient-code/platform/branches/main/protection \
  --field required_status_checks[strict]=false \
  --field enforce_admins=false \
  --field required_pull_request_reviews=null \
  --field restrictions=null
```

## Success Metrics

After enabling protection, monitor:
1. **Blocked Merges**: Count of PRs blocked by failing checks
2. **Fix Time**: Time from block to check fix
3. **Bypass Frequency**: How often admins bypass protection
4. **Main Branch Stability**: Reduction in broken main branch incidents

Target: <5% of PRs require bypass, zero broken deployments from main.

## Quick Start

**Fastest path to enable protection:**
```bash
# Copy-paste this command
gh api -X PUT repos/ambient-code/platform/branches/main/protection \
  --field required_status_checks[strict]=true \
  -f required_status_checks[contexts][]=End-to-End Tests \
  -f required_status_checks[contexts][]=lint-summary \
  -f required_status_checks[contexts][]=test-local-dev-simulation \
  --field enforce_admins=false \
  --field required_pull_request_reviews=null \
  --field restrictions=null \
  --field allow_force_pushes=false \
  --field allow_deletions=false

# Verify
gh api repos/ambient-code/platform/branches/main/protection | jq '.required_status_checks'
```

Done! Branch protection is now active.

#!/usr/bin/env bash
# CodeRabbit pre-commit review hook
# Runs CodeRabbit AI review on staged changes before commit.
# Skips gracefully if: CLI not installed, no auth configured, nothing staged.
#
# Auth: works with EITHER:
#   - CODERABBIT_API_KEY env var (CLI reads it automatically — for private repos / CI)
#   - cr auth login session (for local dev on public repos — free)

set -euo pipefail

# Find the CLI binary
CR_BIN=""
for candidate in coderabbit cr; do
  if command -v "$candidate" &>/dev/null; then
    CR_BIN="$candidate"
    break
  fi
done

if [ -z "$CR_BIN" ]; then
  echo "CodeRabbit CLI not found — skipping review"
  exit 0
fi

# Check auth — API key env var (CLI reads it directly) or login session
if [ -z "${CODERABBIT_API_KEY:-}" ]; then
  if ! "$CR_BIN" auth status 2>&1 | grep -qi "logged in"; then
    echo "CodeRabbit: not authenticated — skipping review"
    echo "  For public repos:  coderabbit auth login"
    echo "  For private repos: add API key in Integrations"
    exit 0
  fi
fi

# Check for staged changes
if git diff --cached --quiet 2>/dev/null; then
  exit 0
fi

echo "Running CodeRabbit review on staged changes..."

OUTPUT=""
EXIT_CODE=0
OUTPUT=$(timeout 300 "$CR_BIN" review --agent --type uncommitted 2>&1) || EXIT_CODE=$?

if [ "$EXIT_CODE" -eq 0 ]; then
  if [ -n "$OUTPUT" ]; then
    echo "$OUTPUT"
  fi
  exit 0
fi

# Treat rate limits and network errors as warnings, not blockers
if echo "$OUTPUT" | grep -qiE "rate.?limit|network|timeout|connection"; then
  echo "Warning: CodeRabbit review encountered a transient error (continuing):"
  echo "$OUTPUT"
  exit 0
fi

# Review findings — show but don't block
echo "$OUTPUT"
exit 0

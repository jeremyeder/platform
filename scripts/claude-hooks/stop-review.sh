#!/usr/bin/env bash
# Stop hook: suggest running /amber-review if files were modified during the session.
# Called by Claude Code's Stop hook — reads the stop_hook_input from stdin.

set -euo pipefail

# Check for uncommitted changes (staged or unstaged)
if git diff --quiet HEAD 2>/dev/null && git diff --cached --quiet 2>/dev/null; then
  exit 0
fi

cat <<'MSG'
Files modified. Consider running /amber-review before completing.
MSG

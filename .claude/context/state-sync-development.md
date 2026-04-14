# State-Sync Development Context

**When to load:** Working on state-sync scripts, Dockerfile, workspace hydration, or S3 sync logic

## Quick Reference

- **Language:** Bash (POSIX-ish, requires bash for arrays and `${var//pattern/}`)
- **Base image:** Alpine 3.21
- **Tools:** rclone (S3 sync), git (repo operations), jq (JSON parsing), sqlite3 (WAL checkpoint), bash
- **Primary files:** `components/runners/state-sync/hydrate.sh`, `components/runners/state-sync/sync.sh`
- **Spec:** [components/runners/state-sync/spec/spec.md](../../components/runners/state-sync/spec/spec.md)

## Critical Rules

### Input Sanitization

All user-provided path components MUST be stripped to `[a-zA-Z0-9-]`:

```bash
NAMESPACE="${NAMESPACE//[^a-zA-Z0-9-]/}"
SESSION_NAME="${SESSION_NAME//[^a-zA-Z0-9-]/}"
```

Used in S3 and filesystem paths; prevents path traversal.

### Credential Handling

**NEVER log tokens.** The git credential helper writes tokens only to stdout via git credential protocol. It does not echo them.

**ALWAYS strip credentials from persisted URLs:**

```bash
remote_url=$(echo "${remote_url}" | sed 's|://[^@]*@|://|')
```

This runs before writing `metadata.json` for git backups.

**Protect rclone config:** The config file contains S3 credentials and MUST be written with `chmod 600`.

### Error Handling

- `set -e` at script start (both scripts)
- `set +e` before git clone loops — clone failures are non-fatal
- `trap 'final_sync' SIGTERM SIGINT` in sync.sh — ensures final backup on shutdown
- Individual operation failures log warnings and continue; the scripts do not exit on non-critical errors

### Permissions

The 777 permissions on workspace directories are intentional (cross-container UID mismatch, SELinux/SCC fallback). See spec Workspace Structure > Permissions for full rationale.

### S3 Operations

- All S3 access via rclone with `--config /tmp/.config/rclone/rclone.conf`
- Sync uses `--checksum` (content-based, not timestamp-based); hydrate uses `rclone copy` without checksum
- Sync passes `--max-size ${MAX_SYNC_SIZE}` — rclone skips individual files exceeding this limit
- `--copy-links` to follow symlinks
- `--fast-list` to reduce API calls
- Hydrate uses 8 transfers (download), sync uses 4 (upload)

## Testing

No automated test suite exists. Validate changes manually:

1. Deploy to a kind cluster: `make kind-up LOCAL_IMAGES=true`
2. Create a session — verify hydrate logs show workspace creation and repo cloning
3. Wait for sync cycle — verify S3 contains expected paths (`kubectl exec` into MinIO or use `mc` CLI)
4. Delete the session pod and recreate — verify state is restored from S3
5. Test ephemeral mode — remove S3 credentials, verify hydrate succeeds without persistence

Edge cases to test:
- Private repo without credentials (should warn, not fail)
- Workflow with invalid subpath (should fall back to full repo)
- Large workspace exceeding MAX_SYNC_SIZE (should warn, sync anyway)
- SIGTERM during sync (should complete final sync before exit)

## Common Tasks

### Adding a new sync path

1. Add to `SYNC_PATHS` array in both `hydrate.sh` and `sync.sh`
2. Add `mkdir -p` and permission setup in `hydrate.sh`
3. Verify the path is not covered by an exclude pattern

### Adding a new env var

1. Add to the configuration section at the top of the script
2. Apply sanitization if the value is used in filesystem or S3 paths
3. Document in `spec/spec.md` under Inputs

### Changing the base image

1. Update `Dockerfile`
2. Verify all required packages are available (`rclone`, `git`, `jq`, `bash`, `sqlite`)
3. Test that `stat -c%s` works (GNU coreutils syntax; macOS `stat` differs)

## Key Files

- `hydrate.sh` — init container entrypoint
- `sync.sh` — sidecar entrypoint
- `Dockerfile` — container definition
- `spec/spec.md` — behavioral specification

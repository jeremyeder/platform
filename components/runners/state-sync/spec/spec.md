# State-Sync Specification

Session state persistence for the Ambient Code Platform. Ensures workspace data survives pod restarts by synchronizing workspace contents to and from S3-compatible object storage.

## Operational Modes

### Init (hydrate)

Runs as a Kubernetes init container before the runner starts. Prepares the workspace:

1. **Create workspace structure** — directories for framework state, artifacts, file uploads, and repositories
2. **Set permissions** — ownership to uid 1001 (runner user), with 777 fallbacks for cross-container access
3. **Download prior session state** — if S3 is configured and prior state exists, download framework state, artifacts, and file uploads
4. **Fetch git credentials** — retrieve GitHub/GitLab tokens from the backend API using the session's bot token
5. **Install credential helper** — a shell-based git credential helper that maps host patterns to the appropriate token (GitHub or GitLab)
6. **Clone repositories** — iterate `REPOS_JSON`, clone each repo to `/workspace/repos/{name}` on the specified branch (or default branch)
7. **Clone workflow** — if `ACTIVE_WORKFLOW_GIT_URL` is set, clone the workflow repo and optionally extract a subpath
8. **Restore git state** — if S3 contains a `repo-state/` backup, restore branches from bundles, apply uncommitted/staged patches, and verify HEAD matches expectations
9. **Final permissions** — re-apply ownership and permissions after all downloads and clones

### Sidecar (sync)

Runs alongside the runner container for the lifetime of the session pod. Periodically uploads workspace state:

1. **Wait for workspace population** — 30-second initial delay after pod start
2. **Sync loop** — every `SYNC_INTERVAL` seconds (default 60):
   - Check total sync size against `MAX_SYNC_SIZE`
   - Checkpoint any SQLite WAL files in the framework data directory (defensive — databases are created by the framework runtime and are opaque to state-sync)
   - Upload framework state, artifacts, and file uploads to S3 via rclone
   - Write sync metadata (timestamp, session info, paths synced)
3. **Periodic git backup** — every `REPO_BACKUP_INTERVAL` sync cycles (default 5), back up git repo state:
   - Create bundles with all refs
   - Capture uncommitted and staged changes as patches
   - Write metadata (remote URL with credentials stripped, branch, HEAD SHA, local branches)
   - Upload to S3 under `repo-state/`
4. **Graceful shutdown** — on SIGTERM, perform one final git backup + sync before exiting

## Inputs

### Required for persistence

| Variable | Description |
|---|---|
| `AWS_ACCESS_KEY_ID` | S3 access key |
| `AWS_SECRET_ACCESS_KEY` | S3 secret key |

If either is missing, state-sync operates in **ephemeral mode**: hydrate creates the workspace structure but skips S3; sync sleeps indefinitely.

### Session identity

| Variable | Default | Description |
|---|---|---|
| `NAMESPACE` | `default` | Kubernetes namespace (sanitized to `[a-zA-Z0-9-]`) |
| `SESSION_NAME` | `unknown` | Session identifier (sanitized to `[a-zA-Z0-9-]`) |

### S3 configuration

| Variable | Default | Description |
|---|---|---|
| `S3_ENDPOINT` | `http://minio.ambient-code.svc:9000` | S3-compatible endpoint URL |
| `S3_BUCKET` | `ambient-sessions` | Bucket name |

### Framework configuration

| Variable | Default | Description |
|---|---|---|
| `RUNNER_STATE_DIR` | `.claude` | Relative path under `/workspace/` for framework state |

### Repository configuration

| Variable | Default | Description |
|---|---|---|
| `REPOS_JSON` | (empty) | JSON array of `{url, branch, name}` objects |

### Workflow configuration

| Variable | Default | Description |
|---|---|---|
| `ACTIVE_WORKFLOW_GIT_URL` | (empty) | Git URL of the workflow repository |
| `ACTIVE_WORKFLOW_BRANCH` | `main` | Branch to clone |
| `ACTIVE_WORKFLOW_PATH` | (empty) | Subpath within the repo to extract |

### Credential sources

| Variable | Description |
|---|---|
| `GITHUB_TOKEN` | GitHub personal access token (if pre-set, skips backend fetch) |
| `GITLAB_TOKEN` | GitLab access token (if pre-set, skips backend fetch) |
| `BACKEND_API_URL` | Backend API base URL for credential fetch |
| `BOT_TOKEN` | Authentication token for backend API calls |
| `PROJECT_NAME` | Project name for credential endpoint path |

### Sync tuning (sidecar only)

| Variable | Default | Description |
|---|---|---|
| `SYNC_INTERVAL` | `60` | Seconds between sync cycles |
| `MAX_SYNC_SIZE` | `1073741824` | Maximum total sync size in bytes (1 GB) |
| `REPO_BACKUP_INTERVAL` | `5` | Back up git repos every Nth sync cycle |

## Workspace Structure

Hydration produces:

```
/workspace/
  {RUNNER_STATE_DIR}/     # Framework state (e.g., .claude/)
    debug/                # Debug logs (created only when RUNNER_STATE_DIR is ".claude"; excluded from sync regardless)
  artifacts/              # Output files created by the agent
  file-uploads/           # User-uploaded files
  repos/
    {repo-name}/          # Cloned repositories
  workflows/
    {workflow-name}/      # Cloned workflow (or extracted subpath)
```

### Permissions

The runner container runs as uid 1001 (non-root). The init container runs as root.

| Path | Permissions | Rationale |
|---|---|---|
| `{RUNNER_STATE_DIR}/` | 777 | Framework SDK requires write access; group-based permissions don't work across containers with different UIDs |
| `artifacts/` | 755 | Runner user owns, standard access |
| `file-uploads/` | 777 | Content sidecar (uid 1001) must write; init container (root) creates |
| `repos/` | 777 | Runtime repo additions via `clone_repo_at_runtime`; containers may not share groups |

Ownership is set to `1001:0` via `chown` first. The 777 fallback handles environments where `chown` fails (SELinux, OpenShift SCCs with forced fsGroup).

## S3 Storage Layout

```
s3://{bucket}/{namespace}/{session_name}/
  {RUNNER_STATE_DIR}/     # Framework state files
  artifacts/              # Agent output files
  file-uploads/           # User-uploaded files
  repo-state/
    {repo-name}/
      repo.bundle         # Git bundle with all refs
      uncommitted.patch   # Uncommitted tracked changes
      staged.patch        # Staged changes
      metadata.json       # Remote URL, branch, HEAD SHA, local branches, timestamp
  metadata.json           # Sync metadata (last sync time, session info, paths synced)
```

### Sync exclusions

The following patterns are excluded from S3 sync:

- `repos/**` — git handles this separately via bundles
- `node_modules/**`, `.venv/**`, `__pycache__/**`, `*.pyc` — dependency artifacts
- `.cache/**`, `target/**`, `dist/**`, `build/**` — build artifacts
- `.git/**` — git internals (bundled separately)
- `debug/**` — debug logs with symlinks that break rclone

## Behavioral Invariants

1. **Repo clone failures are non-fatal.** Individual repository clone failures MUST log a warning and continue. Other repos and the rest of workspace initialization MUST proceed.

2. **S3 unavailability does not block workspace creation.** If S3 credentials are missing or the endpoint is unreachable, hydration MUST create the workspace structure and exit successfully. The session operates in ephemeral mode.

3. **Credentials never appear in logs or persisted metadata.** The git credential helper writes tokens only to stdout in git credential protocol format. `backup_git_repos` strips embedded credentials from remote URLs before writing `metadata.json` (via `sed 's|://[^@]*@|://|'`).

4. **Final sync on shutdown.** The sidecar MUST trap SIGTERM and perform a complete git backup + workspace sync before exiting. This is the primary mechanism for preserving uncommitted work.

5. **SQLite WAL checkpoint before sync.** Before uploading framework state, all `.db` files MUST be checkpointed (`PRAGMA wal_checkpoint(TRUNCATE)`) to ensure consistent backups. The `.db` files are created by the framework runtime (e.g., Claude Code CLI) and their contents are opaque to state-sync.

6. **Sync size enforcement.** Total sync size MUST be checked against `MAX_SYNC_SIZE` before each cycle. If exceeded, a warning is logged but sync proceeds. Additionally, rclone enforces `--max-size` per-file — individual files exceeding `MAX_SYNC_SIZE` are silently skipped by rclone.

7. **Input sanitization.** `NAMESPACE` and `SESSION_NAME` MUST be stripped to `[a-zA-Z0-9-]` to prevent path traversal in both S3 paths and local filesystem paths.

8. **Rclone config protection.** The rclone configuration file (which contains S3 credentials) MUST be written with mode 600.

## Failure Modes

| Scenario | Behavior |
|---|---|
| S3 not configured (missing credentials) | Hydrate: creates workspace, exits 0. Sync: sleeps forever (keeps sidecar alive). |
| S3 unreachable | Hydrate: workspace created without prior state, exits 0. Sync: logs error, retries next interval. |
| Repo clone fails (auth, network, etc.) | Warning logged, other repos continue. |
| Workflow clone fails | Warning logged, no workflow available. |
| Workflow subpath not found | Warning logged, falls back to entire cloned repo. |
| Git bundle fetch fails during restore | Warning logged, repo stays at freshly-cloned state. |
| Patch apply fails during restore | Warning logged (likely merge conflicts), repo stays at bundle state. |
| HEAD SHA mismatch after restore | Warning logged (diverged state), no corrective action taken. |
| Sync size exceeds MAX_SYNC_SIZE | Warning logged, sync proceeds anyway. |

## Interfaces

### Operator

The Kubernetes operator configures state-sync by setting environment variables on the init container and sidecar container specs. The operator controls:
- Session identity (`NAMESPACE`, `SESSION_NAME`)
- S3 credentials (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- Repository configuration (`REPOS_JSON`)
- Workflow configuration (`ACTIVE_WORKFLOW_GIT_URL`, `ACTIVE_WORKFLOW_BRANCH`, `ACTIVE_WORKFLOW_PATH`)
- Framework selection (`RUNNER_STATE_DIR`)
- Backend API access (`BACKEND_API_URL`, `BOT_TOKEN`, `PROJECT_NAME`)

### Runner container

Reads the `/workspace/` directory structure created by hydration. Expects:
- Repos cloned to `/workspace/repos/{name}`
- Framework state directory at `/workspace/{RUNNER_STATE_DIR}`
- Artifacts directory at `/workspace/artifacts`
- File uploads at `/workspace/file-uploads`

### S3 / MinIO

All S3 operations use rclone. Configuration:
- Provider type: `Other` (S3-compatible), ACL: `private`
- Sync (upload) uses `--checksum` for content-based comparison; hydrate (download) uses `rclone copy` without checksum
- Transfers: 8 (hydrate download), 4 (sync upload)
- `--fast-list` and `--copy-links` enabled

### Backend API

The init container fetches git credentials from `{BACKEND_API_URL}/projects/{PROJECT_NAME}/agentic-sessions/{SESSION_NAME}/credentials/{provider}` using `BOT_TOKEN` for authentication. Providers: `github`, `gitlab`. Tokens are only fetched if not already present in the environment.

## Container

- **Base image:** Alpine 3.21
- **Installed packages:** rclone, git, jq, bash, sqlite
- **Entrypoint:** `/usr/local/bin/sync.sh` (sidecar mode)
- **Init container usage:** overrides entrypoint to `/usr/local/bin/hydrate.sh`

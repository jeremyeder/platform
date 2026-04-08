# Contract: Runner Prompt Extensions

## load_repo_config(repo_path: str) -> dict

**File**: `components/runners/ambient-runner/ambient_runner/platform/config.py`

**Purpose**: Read `.ambient/config.json` from a cloned repository.

**Input**: Absolute path to the repo root (e.g., `/workspace/repos/my-repo`)
**Output**: Parsed dict or empty dict if file missing/invalid

```python
def load_repo_config(repo_path: str) -> dict:
    """Load .ambient/config.json from a repository.

    Returns the parsed config dict, or {} if:
    - File doesn't exist
    - File contains invalid JSON
    - Any IO error occurs
    """
```

**Behavior**:
- Returns `{}` if `.ambient/config.json` not found (no error)
- Returns `{}` and logs warning if JSON is invalid
- Returns parsed dict on success
- Never raises exceptions

---

## is_continuous_learning_enabled(repo_configs: list[dict], workspace_flag: bool) -> tuple[bool, str | None]

**File**: `components/runners/ambient-runner/ambient_runner/platform/config.py`

**Purpose**: Evaluate both CL gates. Returns (enabled, target_repo_path).

```python
def is_continuous_learning_enabled(
    repo_configs: list[tuple[str, dict]],  # [(repo_path, config_dict), ...]
    workspace_flag: bool,
) -> tuple[bool, str | None]:
    """Check if continuous learning is enabled.

    Two gates:
    1. workspace_flag must be True
    2. At least one repo config must have learning.enabled = True

    If multiple repos have learning enabled, warns and uses first.

    Returns:
        (enabled, target_repo_path) or (False, None)
    """
```

---

## evaluate_workspace_flag(backend_url: str, project: str, flag_name: str, token: str) -> bool

**File**: `components/runners/ambient-runner/ambient_runner/platform/config.py`

**Purpose**: Call backend API to evaluate a workspace feature flag.

```python
async def evaluate_workspace_flag(
    backend_url: str,
    project: str,
    flag_name: str,
    token: str,
) -> bool:
    """Evaluate a workspace feature flag via the backend API.

    Calls GET /api/projects/{project}/feature-flags/evaluate/{flag_name}
    Returns the 'enabled' field from the response, or False on any error.
    """
```

---

## build_continuous_learning_prompt(target_repo: str, session_env: dict) -> str

**File**: `components/runners/ambient-runner/ambient_runner/platform/prompts.py`

**Purpose**: Generate the CL system prompt section.

**Input**:
- `target_repo`: Path to the repo with CL enabled
- `session_env`: Dict with `session_id`, `project_name`, `user_name`

**Output**: Formatted prompt string (~40 lines) containing:
- Correction capture instructions
- Explicit capture instructions
- "What NOT to capture" guidance
- Env var substitution for frontmatter templates

---

## build_wiki_injection_prompt(wiki_index_path: str) -> str

**File**: `components/runners/ambient-runner/ambient_runner/platform/prompts.py`

**Purpose**: Generate wiki context injection for the system prompt.

**Input**: Absolute path to `docs/wiki/INDEX.md`
**Output**: Formatted prompt string instructing the agent to:
- Read INDEX.md for topic overview
- Use coverage indicators to decide when to read raw sources
- Fall back to raw `docs/` files for low-coverage sections

Returns empty string if `wiki_index_path` doesn't exist.

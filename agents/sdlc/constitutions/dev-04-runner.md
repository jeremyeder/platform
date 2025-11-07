---
agent_id: dev-04-runner
agent_name: Python Runner Agent
version: 1.0.0
status: active
last_updated: 2025-11-06
category: development
maintainer: Jeremy Eder <jeder@redhat.com>
tools:
  - Python 3.11+
  - Claude Code SDK 0.0.23+
  - Anthropic Python SDK 0.68.0+
  - black
  - isort
  - flake8
integration_points:
  - dev-02-operator
  - qa-01-backend-testing
---

# Python Runner Agent

**Version**: 1.0.0
**Status**: Active
**Category**: Development

## Mission

Develop and maintain the Python-based Claude Code runner with focus on SDK integration, workspace synchronization, and multi-agent collaboration capabilities.

## Core Responsibilities

1. Integrate Claude Code SDK for agentic session execution
2. Implement workspace synchronization via PVC proxy for repository access
3. Handle Anthropic API streaming with proper error handling and retries
4. Manage multi-repo workspace configuration and Claude working directory setup
5. Implement interactive mode with inbox/outbox file communication
6. Follow Python best practices (virtual environments, type hints, error handling)
7. Maintain clean code formatting (black, isort) and pass linting (flake8)

## Critical Patterns

### Virtual Environment Usage (REQUIRED)

**Pattern**: [Pattern: python-virtual-environments]

ALWAYS use virtual environments for development. NEVER install packages globally.

```bash
# ✅ REQUIRED: Virtual environment setup
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# OR using uv (preferred)
uv venv
source .venv/bin/activate
uv pip install -r requirements.txt

# ❌ NEVER: Global installation
pip install claude-code-sdk  # WRONG: Affects system Python
```

### Claude Code SDK Integration (REQUIRED)

**Pattern**: [Pattern: claude-code-sdk-integration]

Use Claude Code SDK for all agentic session execution. Handle errors gracefully and stream results.

```python
# ✅ REQUIRED: Proper SDK usage
from claude_code_sdk import AgenticSession
import anthropic

def run_agentic_session(prompt: str, workspace: str, anthropic_api_key: str):
    client = anthropic.Anthropic(api_key=anthropic_api_key)

    try:
        session = AgenticSession(
            client=client,
            workspace=workspace,
            model="claude-sonnet-4-5-20250929"
        )

        # Stream execution
        for event in session.execute(prompt):
            if event.type == "message":
                print(f"Message: {event.content}")
            elif event.type == "tool_use":
                print(f"Tool: {event.tool_name}")
            elif event.type == "error":
                print(f"Error: {event.message}")
                raise RuntimeError(f"Session failed: {event.message}")

        return session.get_results()

    except anthropic.APIError as e:
        print(f"Anthropic API error: {e}")
        raise
    except Exception as e:
        print(f"Session execution failed: {e}")
        raise

# ❌ NEVER: No error handling or streaming
def run_session(prompt):
    session = AgenticSession(client, workspace)
    return session.execute(prompt)  # WRONG: No error handling, no streaming
```

### Workspace Synchronization (REQUIRED)

**Pattern**: [Pattern: workspace-synchronization]

Clone repositories to workspace, handle multi-repo configuration, set correct working directory.

```python
# ✅ REQUIRED: Multi-repo workspace setup
import os
import subprocess
from typing import List, Dict

def setup_workspace(repos: List[Dict], workspace: str, main_repo_index: int = 0):
    """
    Clone repositories to workspace and set main repo as working directory.

    Args:
        repos: List of repo configs [{"url": "...", "branch": "main"}, ...]
        workspace: Base workspace path
        main_repo_index: Index of main repo (where Claude runs)
    """
    cloned_paths = []

    for i, repo in enumerate(repos):
        repo_name = repo["url"].split("/")[-1].replace(".git", "")
        repo_path = os.path.join(workspace, repo_name)

        # Clone repository
        try:
            subprocess.run(
                ["git", "clone", "-b", repo["branch"], repo["url"], repo_path],
                check=True,
                capture_output=True,
                text=True
            )
            print(f"Cloned {repo_name} to {repo_path}")
            cloned_paths.append(repo_path)
        except subprocess.CalledProcessError as e:
            print(f"Failed to clone {repo_name}: {e.stderr}")
            raise

    # Set main repo as working directory
    main_repo_path = cloned_paths[main_repo_index]
    os.chdir(main_repo_path)
    print(f"Working directory: {main_repo_path}")

    return cloned_paths

# ❌ NEVER: No error handling or validation
def setup_workspace(repos, workspace):
    for repo in repos:
        subprocess.run(["git", "clone", repo["url"]])  # WRONG: No error handling
```

### Code Formatting and Linting (MANDATORY)

**Pattern**: [Pattern: python-code-formatting]

ALWAYS run black, isort, and flake8 before committing. Use default settings.

```bash
# ✅ REQUIRED: Pre-commit formatting
black runner.py
isort runner.py
flake8 runner.py --ignore=E501

# Run all at once
black . && isort . && flake8 . --ignore=E501

# ❌ NEVER: Skip formatting
git add runner.py
git commit -m "Add feature"  # WRONG: No formatting
```

**CI enforcement**:
```yaml
# .github/workflows/python-lint.yml
- name: Check formatting
  run: |
    black --check .
    isort --check-only .
    flake8 . --ignore=E501
```

## Tools & Technologies

- **Language**: Python 3.11+, type hints (mypy optional)
- **SDK**: claude-code-sdk (>= 0.0.23), anthropic (>= 0.68.0)
- **Formatting**: black (default config), isort (black profile)
- **Linting**: flake8 (ignore E501 line length)
- **Testing**: pytest, pytest-mock
- **Package Management**: uv (preferred) or pip with venv

## Integration Points

### DEV-02 (Operator)
- Operator spawns Jobs that run this runner
- Coordinate on environment variable passing (ANTHROPIC_API_KEY, WORKSPACE_PATH)
- Share error handling patterns for Job failures

### QA-01 (Backend Testing)
- Write unit tests for workspace setup logic
- Test error handling for API failures
- Mock Anthropic API calls in tests

## Pre-Commit Checklist

Before committing runner code:

- [ ] Virtual environment used during development
- [ ] Claude Code SDK integration follows documented patterns
- [ ] Workspace synchronization handles multi-repo configs
- [ ] Error handling for API calls and git operations
- [ ] Run `black .` for code formatting
- [ ] Run `isort .` for import sorting
- [ ] Run `flake8 . --ignore=E501` (0 errors)
- [ ] Type hints added to new functions
- [ ] Tests written/updated for new functionality

## Detection & Validation

**Automated checks**:
```bash
# Find global pip usage (should use venv)
grep -r "^pip install" scripts/ Dockerfile

# Check formatting
black --check components/runners/claude-code-runner/
isort --check-only components/runners/claude-code-runner/
flake8 components/runners/claude-code-runner/ --ignore=E501

# Check for missing error handling
grep -r "anthropic\." components/runners/ | grep -v "try:\|except"
```

**Manual validation**:
1. Create AgenticSession with invalid API key → verify error logged and CR status updated
2. Create session with unreachable repo URL → verify clone error handled
3. Run session with multi-repo config → verify correct working directory set
4. Test interactive mode → verify inbox/outbox file communication works

## Success Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| **Code formatting violations** | 0 | black --check, isort --check |
| **Linting errors** | 0 | flake8 output |
| **Type hint coverage** | 80%+ | mypy (optional) |
| **Session success rate** | >95% | CR status tracking |
| **Error handling coverage** | 100% for external calls | Code review |

## Reference Patterns

Load these patterns when invoked:
- No shared patterns needed (runner is self-contained)
- See runner-specific README for implementation details

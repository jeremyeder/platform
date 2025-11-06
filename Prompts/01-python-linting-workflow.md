# Task: Implement Python Linting Workflow

## Context

The vTeam repository has Python components (`components/runners/claude-code-runner/` and `components/runners/runner-shell/`) but no automated Python linting in CI/CD. This is a critical gap that needs to be addressed.

## Objectives

Create a GitHub Actions workflow that enforces Python code quality standards for all Python components in the repository.

## Requirements

### 1. Workflow Configuration

Create `.github/workflows/python-lint.yml` with:

- **Triggers:**
  - Push to `main` branch
  - Pull requests to `main` branch
  - Manual workflow dispatch

- **Change Detection:**
  - Only run when Python files are modified
  - Detect changes in:
    - `components/runners/**/*.py`
    - `components/runners/**/pyproject.toml`
    - `components/runners/**/requirements*.txt`

### 2. Linting Tools (in order)

Each component should be linted separately with these tools:

1. **Black** (code formatting)
   - Line length: 88 characters (default)
   - Check mode only (don't modify files)
   - Fail if code is not formatted

2. **isort** (import sorting)
   - Profile: black (compatible with black)
   - Check mode only
   - Fail if imports are not sorted

3. **flake8** (linting)
   - Max line length: 88
   - Ignore: E203, W503 (black compatibility)
   - Fail on any violations

4. **mypy** (type checking) - OPTIONAL
   - Only if component uses type hints
   - Can be added later if needed

### 3. Component Structure

The workflow should lint both Python components:

- `components/runners/claude-code-runner/`
- `components/runners/runner-shell/`

Use a matrix strategy to run linting jobs in parallel.

### 4. Python Environment Setup

- Use `actions/setup-python@v5`
- Python version: Read from each component's `pyproject.toml` if specified, otherwise use 3.11
- Use `uv` for dependency installation (faster than pip)
- Cache dependencies for faster runs

### 5. Output and Reporting

- Clear error messages when linting fails
- Show which files failed and why
- Provide instructions on how to fix locally (e.g., "Run 'black .' to format")
- Summary job that reports overall pass/fail status

## Implementation Pattern

Follow the existing pattern from `.github/workflows/go-lint.yml`:

1. Change detection job (outputs boolean for each component)
2. Lint jobs (one per component, conditional on changes)
3. Summary job (always runs, checks overall status)

## Expected File Structure

```
.github/workflows/python-lint.yml      # New workflow
components/runners/claude-code-runner/
  ├── pyproject.toml                   # Already exists
  └── (Python source files)
components/runners/runner-shell/
  ├── pyproject.toml                   # Already exists
  └── (Python source files)
```

## Success Criteria

- [ ] Workflow runs on Python file changes
- [ ] Skips when no Python files are modified
- [ ] Tests black formatting
- [ ] Tests isort import ordering
- [ ] Tests flake8 linting
- [ ] Provides clear error messages
- [ ] Can be run manually via workflow_dispatch
- [ ] Follows vTeam conventions (similar to go-lint.yml)
- [ ] Uses `uv` instead of `pip` where possible

## References

- Existing Go linting workflow: `.github/workflows/go-lint.yml`
- CLAUDE.md Python standards: Lines 141-163
- Python components:
  - `components/runners/claude-code-runner/`
  - `components/runners/runner-shell/`

## Notes

- This aligns with CLAUDE.md requirements for Python code quality
- Should be enforced on all new Python code going forward
- Consider adding pre-commit hooks later for local enforcement
- Use `uv pip install` instead of regular `pip install` for faster dependency installation

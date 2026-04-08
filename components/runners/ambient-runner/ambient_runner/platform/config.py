"""
Configuration loading for the Ambient Runner SDK.

Reads ambient.json, MCP server config, and repository configuration
from environment variables and the filesystem.
"""

import json as _json
import logging
import os
from pathlib import Path

from ambient_runner.platform.context import RunnerContext
from ambient_runner.platform.utils import expand_env_vars, parse_owner_repo

logger = logging.getLogger(__name__)


def load_ambient_config(cwd_path: str) -> dict:
    """Load ambient.json configuration from workflow directory.

    Returns:
        Parsed config dict, or empty dict if not found / invalid.
    """
    try:
        config_path = Path(cwd_path) / ".ambient" / "ambient.json"

        if not config_path.exists():
            logger.info(f"No ambient.json found at {config_path}, using defaults")
            return {}

        with open(config_path, "r") as f:
            config = _json.load(f)
            logger.info(f"Loaded ambient.json: name={config.get('name')}")
            return config

    except _json.JSONDecodeError as e:
        logger.error(f"Failed to parse ambient.json: {e}")
        return {}
    except Exception as e:
        logger.error(f"Error loading ambient.json: {e}")
        return {}


def load_mcp_config(context: RunnerContext, cwd_path: str) -> dict | None:
    """Load MCP server configuration from the ambient runner's .mcp.json file.

    Returns:
        Dict of MCP server configs with env vars expanded, or None.
    """
    try:
        mcp_config_file = context.get_env(
            "MCP_CONFIG_FILE", "/app/ambient-runner/.mcp.json"
        )
        runner_mcp_file = Path(mcp_config_file)

        if runner_mcp_file.exists() and runner_mcp_file.is_file():
            logger.info(f"Loading MCP config from: {runner_mcp_file}")
            with open(runner_mcp_file, "r") as f:
                config = _json.load(f)
                mcp_servers = config.get("mcpServers", {})
                expanded = expand_env_vars(mcp_servers)
                logger.info(f"Expanded MCP config env vars for {len(expanded)} servers")
                return expanded
        else:
            logger.info(f"No MCP config file found at: {runner_mcp_file}")
            return None

    except _json.JSONDecodeError as e:
        logger.error(f"Failed to parse MCP config: {e}")
        return None
    except Exception as e:
        logger.error(f"Error loading MCP config: {e}")
        return None


def load_repo_config(repo_path: str) -> dict:
    """Load .ambient/config.json from a repository.

    Returns the parsed config dict, or {} if file is missing or invalid.
    """
    try:
        config_path = Path(repo_path) / ".ambient" / "config.json"
        if not config_path.exists():
            return {}
        with open(config_path, "r") as f:
            config = _json.load(f)
            logger.info(f"Loaded .ambient/config.json from {repo_path}")
            return config
    except _json.JSONDecodeError as e:
        logger.warning(f"Invalid JSON in .ambient/config.json at {repo_path}: {e}")
        return {}
    except Exception as e:
        logger.warning(f"Error reading .ambient/config.json at {repo_path}: {e}")
        return {}


async def evaluate_workspace_flag(
    backend_url: str,
    project: str,
    flag_name: str,
    token: str,
) -> bool:
    """Evaluate a workspace feature flag via the backend API.

    Calls GET /api/projects/{project}/feature-flags/evaluate/{flag_name}.
    Returns the 'enabled' field from the response, or False on any error.
    """
    import aiohttp

    url = f"{backend_url}/api/projects/{project}/feature-flags/evaluate/{flag_name}"
    headers = {"Authorization": f"Bearer {token}"}
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                url, headers=headers, timeout=aiohttp.ClientTimeout(total=5)
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    enabled = data.get("enabled", False)
                    logger.info(
                        f"Feature flag {flag_name}: enabled={enabled}, "
                        f"source={data.get('source', 'unknown')}"
                    )
                    return enabled
                logger.warning(
                    f"Feature flag evaluation failed: {flag_name} status={resp.status}"
                )
                return False
    except Exception as e:
        logger.warning(f"Feature flag evaluation error for {flag_name}: {e}")
        return False


def is_continuous_learning_enabled(
    repo_configs: list[tuple[str, dict]],
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
    if not workspace_flag:
        logger.info("Continuous learning: workspace flag is disabled")
        return False, None

    cl_repos = [
        (path, cfg)
        for path, cfg in repo_configs
        if cfg.get("learning", {}).get("enabled", False)
    ]

    if not cl_repos:
        logger.info("Continuous learning: no repo has learning.enabled=true")
        return False, None

    if len(cl_repos) > 1:
        repo_names = [path for path, _ in cl_repos]
        logger.warning(
            f"Continuous learning: multiple repos have learning enabled "
            f"({repo_names}). Using first: {cl_repos[0][0]}"
        )

    target_path = cl_repos[0][0]
    logger.info(f"Continuous learning enabled for repo: {target_path}")
    return True, target_path


def get_repos_config() -> list[dict]:
    """Read repos mapping from REPOS_JSON env if present.

    Expected format::

        [{"url": "...", "branch": "main", "autoPush": true}, ...]

    Returns:
        List of dicts: ``[{"name": ..., "url": ..., "branch": ..., "autoPush": bool}, ...]``
    """
    try:
        raw = os.getenv("REPOS_JSON", "").strip()
        if not raw:
            return []
        data = _json.loads(raw)
        if isinstance(data, list):
            out: list[dict] = []
            for it in data:
                if not isinstance(it, dict):
                    continue

                url = str(it.get("url") or "").strip()
                branch_from_json = it.get("branch")
                if branch_from_json and str(branch_from_json).strip():
                    branch = str(branch_from_json).strip()
                else:
                    session_id = os.getenv("AGENTIC_SESSION_NAME", "").strip()
                    branch = f"ambient/{session_id}" if session_id else "main"
                auto_push_raw = it.get("autoPush", False)
                auto_push = auto_push_raw if isinstance(auto_push_raw, bool) else False

                if not url:
                    continue

                name = str(it.get("name") or "").strip()
                if not name:
                    try:
                        _owner, repo, _ = parse_owner_repo(url)
                        derived = repo or ""
                        if not derived:
                            from urllib.parse import urlparse

                            p = urlparse(url)
                            parts = [pt for pt in (p.path or "").split("/") if pt]
                            if parts:
                                derived = parts[-1]
                        name = (derived or "").removesuffix(".git").strip()
                    except Exception:
                        name = ""

                if name and url:
                    out.append(
                        {
                            "name": name,
                            "url": url,
                            "branch": branch,
                            "autoPush": auto_push,
                        }
                    )
            return out
    except Exception:
        return []
    return []

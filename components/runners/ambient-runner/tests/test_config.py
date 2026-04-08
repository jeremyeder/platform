"""Tests for Continuous Learning configuration functions in config.py.

Covers:
- load_repo_config: reading .ambient/config.json from repos
- evaluate_workspace_flag: async feature flag evaluation via backend API
- is_continuous_learning_enabled: two-gate enablement logic
"""

import json
import logging
from unittest.mock import AsyncMock, MagicMock, patch


from ambient_runner.platform.config import (
    evaluate_workspace_flag,
    is_continuous_learning_enabled,
    load_repo_config,
)


# ------------------------------------------------------------------
# load_repo_config
# ------------------------------------------------------------------


class TestLoadRepoConfig:
    """Tests for load_repo_config()."""

    def test_valid_config_with_learning_enabled(self, tmp_path):
        """Valid .ambient/config.json with learning.enabled=true returns the dict."""
        config_dir = tmp_path / ".ambient"
        config_dir.mkdir()
        config = {"learning": {"enabled": True}}
        (config_dir / "config.json").write_text(json.dumps(config))

        result = load_repo_config(str(tmp_path))

        assert result == {"learning": {"enabled": True}}

    def test_missing_config_returns_empty(self, tmp_path):
        """Missing .ambient/config.json returns empty dict."""
        result = load_repo_config(str(tmp_path))

        assert result == {}

    def test_invalid_json_returns_empty_and_logs_warning(self, tmp_path, caplog):
        """Invalid JSON in .ambient/config.json returns {} and logs a warning."""
        config_dir = tmp_path / ".ambient"
        config_dir.mkdir()
        (config_dir / "config.json").write_text("{invalid json!!!}")

        with caplog.at_level(logging.WARNING):
            result = load_repo_config(str(tmp_path))

        assert result == {}
        assert any("Invalid JSON" in msg for msg in caplog.messages)

    def test_missing_learning_key_returns_full_dict(self, tmp_path):
        """Config without 'learning' key returns the full dict (caller checks)."""
        config_dir = tmp_path / ".ambient"
        config_dir.mkdir()
        config = {"other_setting": "value"}
        (config_dir / "config.json").write_text(json.dumps(config))

        result = load_repo_config(str(tmp_path))

        assert result == {"other_setting": "value"}
        assert "learning" not in result

    def test_extra_keys_returned_for_forward_compatibility(self, tmp_path):
        """Extra keys are returned unchanged (forward-compatible)."""
        config_dir = tmp_path / ".ambient"
        config_dir.mkdir()
        config = {
            "learning": {"enabled": True},
            "future_feature": {"foo": "bar"},
            "version": 2,
        }
        (config_dir / "config.json").write_text(json.dumps(config))

        result = load_repo_config(str(tmp_path))

        assert result == config
        assert result["future_feature"] == {"foo": "bar"}
        assert result["version"] == 2


# ------------------------------------------------------------------
# evaluate_workspace_flag
# ------------------------------------------------------------------


class TestEvaluateWorkspaceFlag:
    """Tests for evaluate_workspace_flag() async function."""

    async def test_returns_true_when_enabled(self):
        """Successful evaluation returns True when response is {"enabled": true}."""
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value={"enabled": True, "source": "unleash"})

        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session_ctx)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_session_ctx.get = MagicMock(return_value=mock_resp)
        mock_session_ctx.get.return_value.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_session_ctx.get.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("aiohttp.ClientSession", return_value=mock_session_ctx):
            result = await evaluate_workspace_flag(
                backend_url="http://backend:8080",
                project="my-project",
                flag_name="continuous-learning",
                token="test-token",
            )

        assert result is True

    async def test_returns_false_when_backend_unreachable(self):
        """Backend unreachable returns False."""
        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session_ctx)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_session_ctx.get = MagicMock(side_effect=Exception("Connection refused"))

        with patch("aiohttp.ClientSession", return_value=mock_session_ctx):
            result = await evaluate_workspace_flag(
                backend_url="http://unreachable:8080",
                project="my-project",
                flag_name="continuous-learning",
                token="test-token",
            )

        assert result is False

    async def test_returns_false_on_non_200_status(self):
        """Non-200 status returns False."""
        mock_resp = AsyncMock()
        mock_resp.status = 500

        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session_ctx)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_session_ctx.get = MagicMock(return_value=mock_resp)
        mock_session_ctx.get.return_value.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_session_ctx.get.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("aiohttp.ClientSession", return_value=mock_session_ctx):
            result = await evaluate_workspace_flag(
                backend_url="http://backend:8080",
                project="my-project",
                flag_name="continuous-learning",
                token="test-token",
            )

        assert result is False

    async def test_returns_false_when_enabled_field_missing(self):
        """Response without 'enabled' field returns False (default)."""
        mock_resp = AsyncMock()
        mock_resp.status = 200
        mock_resp.json = AsyncMock(return_value={"source": "default"})

        mock_session_ctx = AsyncMock()
        mock_session_ctx.__aenter__ = AsyncMock(return_value=mock_session_ctx)
        mock_session_ctx.__aexit__ = AsyncMock(return_value=False)
        mock_session_ctx.get = MagicMock(return_value=mock_resp)
        mock_session_ctx.get.return_value.__aenter__ = AsyncMock(return_value=mock_resp)
        mock_session_ctx.get.return_value.__aexit__ = AsyncMock(return_value=False)

        with patch("aiohttp.ClientSession", return_value=mock_session_ctx):
            result = await evaluate_workspace_flag(
                backend_url="http://backend:8080",
                project="my-project",
                flag_name="continuous-learning",
                token="test-token",
            )

        assert result is False


# ------------------------------------------------------------------
# is_continuous_learning_enabled
# ------------------------------------------------------------------


class TestIsContinuousLearningEnabled:
    """Tests for is_continuous_learning_enabled()."""

    def test_both_gates_on(self):
        """workspace_flag=True + repo has learning.enabled=true -> (True, path)."""
        repo_configs = [
            ("/workspace/repos/my-app", {"learning": {"enabled": True}}),
        ]

        enabled, target = is_continuous_learning_enabled(
            repo_configs=repo_configs,
            workspace_flag=True,
        )

        assert enabled is True
        assert target == "/workspace/repos/my-app"

    def test_flag_off_returns_false(self):
        """workspace_flag=False -> (False, None) regardless of repo config."""
        repo_configs = [
            ("/workspace/repos/my-app", {"learning": {"enabled": True}}),
        ]

        enabled, target = is_continuous_learning_enabled(
            repo_configs=repo_configs,
            workspace_flag=False,
        )

        assert enabled is False
        assert target is None

    def test_config_off_returns_false(self):
        """workspace_flag=True but no repo has learning.enabled -> (False, None)."""
        repo_configs = [
            ("/workspace/repos/my-app", {"other": "config"}),
            ("/workspace/repos/lib", {}),
        ]

        enabled, target = is_continuous_learning_enabled(
            repo_configs=repo_configs,
            workspace_flag=True,
        )

        assert enabled is False
        assert target is None

    def test_multi_repo_warning(self, caplog):
        """Two repos with learning.enabled -> (True, first_path) and warning."""
        repo_configs = [
            ("/workspace/repos/first", {"learning": {"enabled": True}}),
            ("/workspace/repos/second", {"learning": {"enabled": True}}),
        ]

        with caplog.at_level(logging.WARNING):
            enabled, target = is_continuous_learning_enabled(
                repo_configs=repo_configs,
                workspace_flag=True,
            )

        assert enabled is True
        assert target == "/workspace/repos/first"
        assert any("multiple repos" in msg.lower() for msg in caplog.messages)

    def test_empty_repo_configs(self):
        """Empty repo_configs list with flag on -> (False, None)."""
        enabled, target = is_continuous_learning_enabled(
            repo_configs=[],
            workspace_flag=True,
        )

        assert enabled is False
        assert target is None

    def test_learning_enabled_false_in_config(self):
        """Repo config has learning.enabled=false -> not treated as enabled."""
        repo_configs = [
            ("/workspace/repos/my-app", {"learning": {"enabled": False}}),
        ]

        enabled, target = is_continuous_learning_enabled(
            repo_configs=repo_configs,
            workspace_flag=True,
        )

        assert enabled is False
        assert target is None

    def test_mixed_repos_picks_enabled_one(self):
        """Multiple repos where only one has learning.enabled=true -> picks that one."""
        repo_configs = [
            ("/workspace/repos/no-learning", {"learning": {"enabled": False}}),
            ("/workspace/repos/has-learning", {"learning": {"enabled": True}}),
            ("/workspace/repos/empty", {}),
        ]

        enabled, target = is_continuous_learning_enabled(
            repo_configs=repo_configs,
            workspace_flag=True,
        )

        assert enabled is True
        assert target == "/workspace/repos/has-learning"

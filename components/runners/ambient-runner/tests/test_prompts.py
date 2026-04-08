"""Tests for Continuous Learning prompt functions in prompts.py.

Covers:
- build_continuous_learning_prompt: CL system prompt section generation
- build_wiki_injection_prompt: wiki context injection
- build_workspace_context_prompt: CL integration via cl_config parameter
"""

import os
from unittest.mock import patch

from ambient_runner.platform.prompts import (
    build_continuous_learning_prompt,
    build_wiki_injection_prompt,
    build_workspace_context_prompt,
)


# ------------------------------------------------------------------
# build_continuous_learning_prompt
# ------------------------------------------------------------------


class TestBuildContinuousLearningPrompt:
    """Tests for build_continuous_learning_prompt()."""

    def _build(self, **overrides):
        defaults = {
            "target_repo": "/workspace/repos/my-app",
            "session_id": "sess-abc-123",
            "project_name": "test-project",
            "author_name": "Test User",
        }
        defaults.update(overrides)
        return build_continuous_learning_prompt(**defaults)

    def test_correction_capture_instructions_present(self):
        """Output contains Correction Capture section."""
        prompt = self._build()
        assert "Correction Capture" in prompt

    def test_explicit_capture_instructions_present(self):
        """Output contains Explicit Capture section."""
        prompt = self._build()
        assert "Explicit Capture" in prompt

    def test_what_not_to_capture_section_present(self):
        """Output contains 'What NOT to Capture' section."""
        prompt = self._build()
        assert "What NOT to Capture" in prompt

    def test_branch_naming_conventions(self):
        """Output contains branch naming conventions for corrections and patterns."""
        prompt = self._build()
        assert "learned/correction-" in prompt
        assert "learned/pattern-" in prompt

    def test_frontmatter_template_fields(self):
        """Output contains all required frontmatter template fields."""
        prompt = self._build()
        assert "type:" in prompt
        assert "date:" in prompt
        assert "session:" in prompt
        assert "project:" in prompt
        assert "author:" in prompt
        assert "title:" in prompt

    def test_session_id_substitution(self):
        """Session ID is substituted into the output."""
        prompt = self._build(session_id="sess-xyz-789")
        assert "sess-xyz-789" in prompt

    def test_project_name_substitution(self):
        """Project name is substituted into the output."""
        prompt = self._build(project_name="my-workspace")
        assert "my-workspace" in prompt

    def test_author_name_substitution(self):
        """Author name is substituted into the output."""
        prompt = self._build(author_name="Jane Doe")
        assert "Jane Doe" in prompt

    def test_silent_capture_requirement(self):
        """Output instructs silent capture (no user confirmation)."""
        prompt = self._build()
        assert "Do NOT ask the user" in prompt or "Do NOT mention" in prompt

    def test_continuous_learning_header(self):
        """Output starts with the CL header."""
        prompt = self._build()
        assert "## Continuous Learning" in prompt


# ------------------------------------------------------------------
# build_wiki_injection_prompt
# ------------------------------------------------------------------


class TestBuildWikiInjectionPrompt:
    """Tests for build_wiki_injection_prompt()."""

    def test_existing_wiki_index_returns_prompt(self, tmp_path):
        """With existing wiki INDEX.md returns non-empty string with instructions."""
        wiki_dir = tmp_path / "docs" / "wiki"
        wiki_dir.mkdir(parents=True)
        index_path = wiki_dir / "INDEX.md"
        index_path.write_text("# Wiki Index\n- Topic A [coverage: high]\n")

        result = build_wiki_injection_prompt(str(index_path))

        assert result != ""
        assert "coverage" in result.lower()
        assert "Repository Knowledge Base" in result

    def test_nonexistent_wiki_returns_empty(self):
        """Non-existent wiki path returns empty string."""
        result = build_wiki_injection_prompt("/nonexistent/path/INDEX.md")

        assert result == ""

    def test_wiki_prompt_includes_index_path(self, tmp_path):
        """Wiki prompt includes the actual index path for reference."""
        wiki_dir = tmp_path / "docs" / "wiki"
        wiki_dir.mkdir(parents=True)
        index_path = wiki_dir / "INDEX.md"
        index_path.write_text("# Index\n")

        result = build_wiki_injection_prompt(str(index_path))

        assert str(index_path) in result


# ------------------------------------------------------------------
# build_workspace_context_prompt with cl_config
# ------------------------------------------------------------------


class TestBuildWorkspaceContextPromptCL:
    """Tests for build_workspace_context_prompt() CL integration."""

    def _build(self, cl_config=None, **overrides):
        defaults = {
            "repos_cfg": [],
            "workflow_name": None,
            "artifacts_path": "artifacts",
            "ambient_config": {},
            "workspace_path": "/tmp/workspace",
            "cl_config": cl_config,
        }
        defaults.update(overrides)
        return build_workspace_context_prompt(**defaults)

    def test_cl_config_none_no_cl_section(self):
        """cl_config=None produces no CL section in output."""
        prompt = self._build(cl_config=None)

        assert "Continuous Learning" not in prompt

    def test_cl_config_enabled_true_has_cl_section(self, tmp_path):
        """cl_config with enabled=True produces CL section in output."""
        cl_config = {
            "enabled": True,
            "target_repo": str(tmp_path),
            "author_name": "test-author",
        }

        with patch.dict(
            os.environ,
            {
                "AGENTIC_SESSION_NAME": "sess-001",
                "PROJECT_NAME": "test-proj",
            },
        ):
            prompt = self._build(cl_config=cl_config)

        assert "Continuous Learning" in prompt
        assert "Correction Capture" in prompt
        assert "Explicit Capture" in prompt

    def test_cl_config_enabled_false_no_cl_section(self):
        """cl_config with enabled=False produces no CL section."""
        cl_config = {"enabled": False}

        prompt = self._build(cl_config=cl_config)

        assert "Continuous Learning" not in prompt

    def test_cl_config_substitutes_session_and_project(self, tmp_path):
        """CL section substitutes session and project from env vars."""
        cl_config = {
            "enabled": True,
            "target_repo": str(tmp_path),
            "author_name": "jeder",
        }

        with patch.dict(
            os.environ,
            {
                "AGENTIC_SESSION_NAME": "sess-unique-42",
                "PROJECT_NAME": "platform",
            },
        ):
            prompt = self._build(cl_config=cl_config)

        assert "sess-unique-42" in prompt
        assert "platform" in prompt

    def test_cl_config_wiki_injection_when_index_exists(self, tmp_path):
        """CL with existing wiki INDEX.md injects wiki section."""
        wiki_dir = tmp_path / "docs" / "wiki"
        wiki_dir.mkdir(parents=True)
        (wiki_dir / "INDEX.md").write_text("# Wiki\n- Topic [coverage: high]\n")

        cl_config = {
            "enabled": True,
            "target_repo": str(tmp_path),
            "author_name": "test",
        }

        with patch.dict(
            os.environ,
            {
                "AGENTIC_SESSION_NAME": "sess-001",
                "PROJECT_NAME": "proj",
            },
        ):
            prompt = self._build(cl_config=cl_config)

        assert "Repository Knowledge Base" in prompt

    def test_cl_config_no_wiki_when_index_missing(self, tmp_path):
        """CL without wiki INDEX.md does not inject wiki section."""
        cl_config = {
            "enabled": True,
            "target_repo": str(tmp_path),
            "author_name": "test",
        }

        with patch.dict(
            os.environ,
            {
                "AGENTIC_SESSION_NAME": "sess-001",
                "PROJECT_NAME": "proj",
            },
        ):
            prompt = self._build(cl_config=cl_config)

        assert "Repository Knowledge Base" not in prompt

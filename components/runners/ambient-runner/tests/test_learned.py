"""Tests for project memory store (learned files)."""

import json
from pathlib import Path


# ---------------------------------------------------------------------------
# is_learning_enabled()
# ---------------------------------------------------------------------------


class TestIsLearningEnabled:
    """Tests for .ambient/config.json opt-in check."""

    def test_enabled_true(self, tmp_path):
        from ambient_runner.platform.learned import is_learning_enabled

        config_dir = tmp_path / ".ambient"
        config_dir.mkdir()
        (config_dir / "config.json").write_text(
            json.dumps({"learning": {"enabled": True}})
        )
        assert is_learning_enabled(str(tmp_path)) is True

    def test_enabled_false(self, tmp_path):
        from ambient_runner.platform.learned import is_learning_enabled

        config_dir = tmp_path / ".ambient"
        config_dir.mkdir()
        (config_dir / "config.json").write_text(
            json.dumps({"learning": {"enabled": False}})
        )
        assert is_learning_enabled(str(tmp_path)) is False

    def test_missing_config_file(self, tmp_path):
        from ambient_runner.platform.learned import is_learning_enabled

        assert is_learning_enabled(str(tmp_path)) is False

    def test_malformed_json(self, tmp_path):
        from ambient_runner.platform.learned import is_learning_enabled

        config_dir = tmp_path / ".ambient"
        config_dir.mkdir()
        (config_dir / "config.json").write_text("not json {{{")
        assert is_learning_enabled(str(tmp_path)) is False

    def test_missing_learning_key(self, tmp_path):
        from ambient_runner.platform.learned import is_learning_enabled

        config_dir = tmp_path / ".ambient"
        config_dir.mkdir()
        (config_dir / "config.json").write_text(json.dumps({"other": "stuff"}))
        assert is_learning_enabled(str(tmp_path)) is False

    def test_learning_not_dict(self, tmp_path):
        from ambient_runner.platform.learned import is_learning_enabled

        config_dir = tmp_path / ".ambient"
        config_dir.mkdir()
        (config_dir / "config.json").write_text(json.dumps({"learning": "yes"}))
        assert is_learning_enabled(str(tmp_path)) is False


# ---------------------------------------------------------------------------
# parse_learned_file()
# ---------------------------------------------------------------------------


class TestParseLearnedFile:
    """Tests for YAML frontmatter + markdown body parsing."""

    def test_valid_correction(self, tmp_path):
        from ambient_runner.platform.learned import parse_learned_file

        md = tmp_path / "test.md"
        md.write_text(
            "---\n"
            "type: correction\n"
            "date: 2026-04-01T14:30:00Z\n"
            "title: Use Pydantic v2\n"
            "session: session-1\n"
            "project: my-project\n"
            "author: Agent\n"
            "---\n"
            "\n"
            "Always use Pydantic v2 BaseModel.\n"
        )
        entry = parse_learned_file(md)
        assert entry is not None
        assert entry["type"] == "correction"
        assert entry["title"] == "Use Pydantic v2"
        assert entry["date"] == "2026-04-01T14:30:00Z"
        assert entry["session"] == "session-1"
        assert entry["project"] == "my-project"
        assert entry["author"] == "Agent"
        assert "Pydantic v2 BaseModel" in entry["content"]
        assert entry["file_path"] == str(md)

    def test_valid_pattern(self, tmp_path):
        from ambient_runner.platform.learned import parse_learned_file

        md = tmp_path / "pattern.md"
        md.write_text(
            "---\n"
            "type: pattern\n"
            "date: 2026-04-02T10:00:00Z\n"
            "title: Error response format\n"
            "---\n"
            "\n"
            "Use gin.H for error responses.\n"
        )
        entry = parse_learned_file(md)
        assert entry is not None
        assert entry["type"] == "pattern"
        assert entry["session"] == ""
        assert entry["project"] == ""
        assert entry["author"] == ""

    def test_missing_frontmatter(self, tmp_path):
        from ambient_runner.platform.learned import parse_learned_file

        md = tmp_path / "no_fm.md"
        md.write_text("Just some text, no frontmatter.\n")
        assert parse_learned_file(md) is None

    def test_missing_required_fields(self, tmp_path):
        from ambient_runner.platform.learned import parse_learned_file

        md = tmp_path / "bad.md"
        md.write_text("---\ntitle: No type field\n---\nBody.\n")
        assert parse_learned_file(md) is None

    def test_invalid_yaml(self, tmp_path):
        from ambient_runner.platform.learned import parse_learned_file

        md = tmp_path / "bad_yaml.md"
        md.write_text("---\n: [invalid yaml\n---\nBody.\n")
        assert parse_learned_file(md) is None


# ---------------------------------------------------------------------------
# read_learned_entries()
# ---------------------------------------------------------------------------


class TestReadLearnedEntries:
    """Tests for recursive directory reading."""

    def _make_file(self, path: Path, entry_type: str, title: str, date: str):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            f"---\ntype: {entry_type}\ndate: {date}\ntitle: {title}\n---\n\n"
            f"Body for {title}.\n"
        )

    def test_reads_corrections_and_patterns(self, tmp_path):
        from ambient_runner.platform.learned import read_learned_entries

        self._make_file(
            tmp_path / "docs" / "learned" / "corrections" / "c1.md",
            "correction",
            "Fix A",
            "2026-04-01T00:00:00Z",
        )
        self._make_file(
            tmp_path / "docs" / "learned" / "patterns" / "p1.md",
            "pattern",
            "Pattern B",
            "2026-04-02T00:00:00Z",
        )
        entries = read_learned_entries(str(tmp_path))
        assert len(entries) == 2
        types = {e["type"] for e in entries}
        assert types == {"correction", "pattern"}

    def test_empty_directory(self, tmp_path):
        from ambient_runner.platform.learned import read_learned_entries

        (tmp_path / "docs" / "learned").mkdir(parents=True)
        entries = read_learned_entries(str(tmp_path))
        assert entries == []

    def test_no_directory(self, tmp_path):
        from ambient_runner.platform.learned import read_learned_entries

        entries = read_learned_entries(str(tmp_path))
        assert entries == []

    def test_skips_non_md_files(self, tmp_path):
        from ambient_runner.platform.learned import read_learned_entries

        learned = tmp_path / "docs" / "learned" / "corrections"
        learned.mkdir(parents=True)
        (learned / "notes.txt").write_text("not markdown")
        (learned / "image.png").write_bytes(b"\x89PNG")
        self._make_file(
            learned / "valid.md", "correction", "Valid", "2026-04-01T00:00:00Z"
        )
        entries = read_learned_entries(str(tmp_path))
        assert len(entries) == 1

    def test_sorted_newest_first(self, tmp_path):
        from ambient_runner.platform.learned import read_learned_entries

        self._make_file(
            tmp_path / "docs" / "learned" / "corrections" / "old.md",
            "correction",
            "Old",
            "2026-01-01T00:00:00Z",
        )
        self._make_file(
            tmp_path / "docs" / "learned" / "corrections" / "new.md",
            "correction",
            "New",
            "2026-04-15T00:00:00Z",
        )
        entries = read_learned_entries(str(tmp_path))
        assert entries[0]["title"] == "New"
        assert entries[1]["title"] == "Old"

    def test_skips_malformed_files(self, tmp_path):
        from ambient_runner.platform.learned import read_learned_entries

        learned = tmp_path / "docs" / "learned" / "corrections"
        learned.mkdir(parents=True)
        # Valid file
        self._make_file(
            learned / "good.md", "correction", "Good", "2026-04-01T00:00:00Z"
        )
        # Malformed file (no type)
        (learned / "bad.md").write_text("---\ntitle: Missing type\n---\nBody.\n")
        entries = read_learned_entries(str(tmp_path))
        assert len(entries) == 1
        assert entries[0]["title"] == "Good"


# ---------------------------------------------------------------------------
# build_project_memory_prompt()
# ---------------------------------------------------------------------------


class TestBuildProjectMemoryPrompt:
    """Tests for prompt section formatting."""

    def test_corrections_and_patterns(self):
        from ambient_runner.platform.learned import build_project_memory_prompt

        entries = [
            {
                "type": "correction",
                "title": "Fix A",
                "content": "Do X instead of Y.",
                "date": "2026-04-01T00:00:00Z",
            },
            {
                "type": "pattern",
                "title": "Pattern B",
                "content": "Always use pattern Z.",
                "date": "2026-04-02T00:00:00Z",
            },
        ]
        result = build_project_memory_prompt(entries)
        assert "## Project Memory" in result
        assert "### Corrections" in result
        assert "### Patterns" in result
        assert "Fix A" in result
        assert "Pattern B" in result

    def test_only_corrections(self):
        from ambient_runner.platform.learned import build_project_memory_prompt

        entries = [
            {
                "type": "correction",
                "title": "Fix A",
                "content": "Body.",
                "date": "2026-04-01T00:00:00Z",
            },
        ]
        result = build_project_memory_prompt(entries)
        assert "### Corrections" in result
        assert "### Patterns" not in result

    def test_only_patterns(self):
        from ambient_runner.platform.learned import build_project_memory_prompt

        entries = [
            {
                "type": "pattern",
                "title": "Pat A",
                "content": "Body.",
                "date": "2026-04-01T00:00:00Z",
            },
        ]
        result = build_project_memory_prompt(entries)
        assert "### Patterns" in result
        assert "### Corrections" not in result

    def test_empty_entries(self):
        from ambient_runner.platform.learned import build_project_memory_prompt

        result = build_project_memory_prompt([])
        assert result == ""

    def test_token_budget_truncation(self):
        from ambient_runner.platform.learned import build_project_memory_prompt

        # Create many entries that exceed the ~4000 token budget (~16000 chars)
        entries = []
        for i in range(100):
            entries.append(
                {
                    "type": "correction",
                    "title": f"Correction {i}",
                    "content": "A" * 200,
                    "date": f"2026-04-{i % 28 + 1:02d}T00:00:00Z",
                }
            )
        result = build_project_memory_prompt(entries)
        # Should contain truncation note
        assert "additional" in result.lower()
        # Should be under budget (4000 tokens * 4 chars = 16000 chars + overhead)
        assert len(result) < 20000

    def test_unknown_type_skipped(self):
        from ambient_runner.platform.learned import build_project_memory_prompt

        entries = [
            {
                "type": "unknown",
                "title": "X",
                "content": "Body.",
                "date": "2026-04-01T00:00:00Z",
            },
        ]
        result = build_project_memory_prompt(entries)
        assert result == ""


# ---------------------------------------------------------------------------
# get_project_memory_prompt()
# ---------------------------------------------------------------------------


class TestGetProjectMemoryPrompt:
    """Tests for the top-level entry point with config gating."""

    def _make_file(self, path: Path, entry_type: str, title: str, date: str):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            f"---\ntype: {entry_type}\ndate: {date}\ntitle: {title}\n---\n\n"
            f"Body for {title}.\n"
        )

    def _enable_learning(self, tmp_path):
        config_dir = tmp_path / ".ambient"
        config_dir.mkdir(exist_ok=True)
        (config_dir / "config.json").write_text(
            json.dumps({"learning": {"enabled": True}})
        )

    def test_returns_prompt_when_enabled(self, tmp_path):
        from ambient_runner.platform.learned import get_project_memory_prompt

        self._enable_learning(tmp_path)
        self._make_file(
            tmp_path / "docs" / "learned" / "corrections" / "c1.md",
            "correction",
            "Fix A",
            "2026-04-01T00:00:00Z",
        )
        result = get_project_memory_prompt(str(tmp_path))
        assert "## Project Memory" in result
        assert "Fix A" in result

    def test_returns_empty_when_disabled(self, tmp_path):
        from ambient_runner.platform.learned import get_project_memory_prompt

        config_dir = tmp_path / ".ambient"
        config_dir.mkdir()
        (config_dir / "config.json").write_text(
            json.dumps({"learning": {"enabled": False}})
        )
        self._make_file(
            tmp_path / "docs" / "learned" / "corrections" / "c1.md",
            "correction",
            "Fix A",
            "2026-04-01T00:00:00Z",
        )
        result = get_project_memory_prompt(str(tmp_path))
        assert result == ""

    def test_returns_empty_when_no_config(self, tmp_path):
        from ambient_runner.platform.learned import get_project_memory_prompt

        self._make_file(
            tmp_path / "docs" / "learned" / "corrections" / "c1.md",
            "correction",
            "Fix A",
            "2026-04-01T00:00:00Z",
        )
        result = get_project_memory_prompt(str(tmp_path))
        assert result == ""

    def test_non_fatal_on_missing_learned_dir(self, tmp_path):
        from ambient_runner.platform.learned import get_project_memory_prompt

        self._enable_learning(tmp_path)
        # No docs/learned/ dir -- should return empty, not raise
        result = get_project_memory_prompt(str(tmp_path))
        assert result == ""

    def test_groups_by_type(self, tmp_path):
        from ambient_runner.platform.learned import get_project_memory_prompt

        self._enable_learning(tmp_path)
        self._make_file(
            tmp_path / "docs" / "learned" / "corrections" / "c1.md",
            "correction",
            "Fix A",
            "2026-04-01T00:00:00Z",
        )
        self._make_file(
            tmp_path / "docs" / "learned" / "corrections" / "c2.md",
            "correction",
            "Fix B",
            "2026-04-02T00:00:00Z",
        )
        self._make_file(
            tmp_path / "docs" / "learned" / "patterns" / "p1.md",
            "pattern",
            "Pattern X",
            "2026-04-03T00:00:00Z",
        )
        result = get_project_memory_prompt(str(tmp_path))
        # Both sections present
        assert "### Corrections" in result
        assert "### Patterns" in result
        # Corrections section comes before Patterns
        corrections_idx = result.index("### Corrections")
        patterns_idx = result.index("### Patterns")
        assert corrections_idx < patterns_idx

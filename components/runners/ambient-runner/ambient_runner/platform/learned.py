"""
Project Memory Store -- read learned files from docs/learned/ and format
them for system prompt injection.

Learned files are markdown with YAML frontmatter stored in the workspace
repository under ``docs/learned/corrections/`` and ``docs/learned/patterns/``.
The feature is opt-in via ``.ambient/config.json``.

All failures are non-fatal: the runner logs warnings and proceeds without
memories.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path

import yaml

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Opt-in check
# ---------------------------------------------------------------------------


def is_learning_enabled(workspace_root: str) -> bool:
    """Check if learning is enabled via .ambient/config.json.

    Returns True only when the file exists, is valid JSON, and contains
    ``{"learning": {"enabled": true}}``.  All failures return False
    (opt-in, non-fatal).
    """
    config_path = Path(workspace_root) / ".ambient" / "config.json"
    try:
        if not config_path.is_file():
            return False
        with open(config_path) as f:
            data = json.load(f)
        learning = data.get("learning")
        if not isinstance(learning, dict):
            return False
        return learning.get("enabled") is True
    except (json.JSONDecodeError, OSError, TypeError) as exc:
        logger.warning("Failed to read .ambient/config.json: %s", exc)
        return False


# ---------------------------------------------------------------------------
# File parsing
# ---------------------------------------------------------------------------

_FRONTMATTER_DELIMITER = "---"
_REQUIRED_FIELDS = {"type", "date", "title"}


class _NoDateSafeLoader(yaml.SafeLoader):
    """SafeLoader that keeps ISO 8601 timestamps as plain strings.

    The default SafeLoader auto-converts date strings like
    ``2026-04-01T14:30:00Z`` into ``datetime`` objects.  We want to
    preserve the original string so the frontmatter round-trips cleanly.
    """


# Remove the timestamp resolver from our custom loader only
_NoDateSafeLoader.yaml_implicit_resolvers = {
    k: [(tag, regexp) for tag, regexp in v if tag != "tag:yaml.org,2002:timestamp"]
    for k, v in yaml.SafeLoader.yaml_implicit_resolvers.copy().items()
}


def parse_learned_file(file_path: Path) -> dict | None:
    """Parse a learned markdown file with YAML frontmatter.

    Returns a dict with frontmatter fields + ``content`` and ``file_path``,
    or None if the file is malformed or missing required fields.
    """
    try:
        text = file_path.read_text(encoding="utf-8")
    except OSError as exc:
        logger.warning("Cannot read learned file %s: %s", file_path, exc)
        return None

    # Split frontmatter from body
    if not text.startswith(_FRONTMATTER_DELIMITER):
        logger.warning("No frontmatter in %s", file_path)
        return None

    parts = text.split(_FRONTMATTER_DELIMITER, maxsplit=2)
    if len(parts) < 3:
        logger.warning("Malformed frontmatter in %s", file_path)
        return None

    yaml_text = parts[1]
    body = parts[2].strip()

    try:
        meta = yaml.load(yaml_text, Loader=_NoDateSafeLoader)  # noqa: S506
    except yaml.YAMLError as exc:
        logger.warning("Invalid YAML frontmatter in %s: %s", file_path, exc)
        return None

    if not isinstance(meta, dict):
        logger.warning("Frontmatter is not a mapping in %s", file_path)
        return None

    # Validate required fields
    missing = _REQUIRED_FIELDS - set(meta.keys())
    if missing:
        logger.warning("Missing required fields %s in %s", missing, file_path)
        return None

    return {
        "type": str(meta.get("type", "")),
        "date": str(meta.get("date", "")),
        "title": str(meta.get("title", "")),
        "session": str(meta.get("session", "") or ""),
        "project": str(meta.get("project", "") or ""),
        "author": str(meta.get("author", "") or ""),
        "content": body,
        "file_path": str(file_path),
    }


def read_learned_entries(workspace_root: str) -> list[dict]:
    """Read all learned markdown files from docs/learned/.

    Recurses into subdirectories (corrections/, patterns/).  Parses each
    ``.md`` file, skips invalid ones with warnings.  Returns entries sorted
    by date descending (newest first).
    """
    learned_dir = Path(workspace_root) / "docs" / "learned"
    if not learned_dir.is_dir():
        return []

    entries: list[dict] = []
    try:
        for md_file in sorted(learned_dir.rglob("*.md")):
            if not md_file.is_file():
                continue
            entry = parse_learned_file(md_file)
            if entry is not None:
                entries.append(entry)
    except OSError as exc:
        logger.warning("Error reading docs/learned/: %s", exc)

    # Sort newest first by date string (ISO 8601 sorts lexicographically)
    entries.sort(key=lambda e: e.get("date", ""), reverse=True)
    return entries


# ---------------------------------------------------------------------------
# Prompt formatting
# ---------------------------------------------------------------------------

# Approximate token budget for injected memories.
# ~4 chars per token is a conservative estimate for English text.
_TOKEN_BUDGET = 4000
_CHARS_PER_TOKEN = 4
_CHAR_BUDGET = _TOKEN_BUDGET * _CHARS_PER_TOKEN


def _format_entry(entry: dict) -> str:
    """Format a single learned entry as a markdown block."""
    title = entry.get("title", "Untitled")
    content = entry.get("content", "").strip()
    return f"**{title}**: {content}\n"


def build_project_memory_prompt(entries: list[dict]) -> str:
    """Format learned entries into a ``## Project Memory`` prompt section.

    Groups entries by type (correction, pattern).  Enforces a character
    budget (~4000 tokens).  Entries are assumed to be pre-sorted by date
    (newest first).  Returns empty string if no valid entries.
    """
    if not entries:
        return ""

    corrections = [e for e in entries if e.get("type") == "correction"]
    patterns = [e for e in entries if e.get("type") == "pattern"]

    if not corrections and not patterns:
        return ""

    sections: list[str] = []
    total_chars = 0
    included_count = 0
    total_count = len(corrections) + len(patterns)

    header = "## Project Memory\n\n"
    total_chars += len(header)

    for section_title, section_entries in [
        ("### Corrections", corrections),
        ("### Patterns", patterns),
    ]:
        if not section_entries:
            continue

        section_header = f"{section_title}\n\n"
        section_lines: list[str] = []
        section_chars = len(section_header)

        for entry in section_entries:
            formatted = _format_entry(entry)
            entry_chars = len(formatted)
            if total_chars + section_chars + entry_chars > _CHAR_BUDGET:
                break
            section_lines.append(formatted)
            section_chars += entry_chars
            included_count += 1

        if section_lines:
            sections.append(section_header + "\n".join(section_lines) + "\n")
            total_chars += section_chars

    if not sections:
        return ""

    result = header + "\n".join(sections)

    omitted = total_count - included_count
    if omitted > 0:
        result += f"\n*({omitted} additional entries omitted due to token budget)*\n"

    return result


# ---------------------------------------------------------------------------
# Top-level entry point
# ---------------------------------------------------------------------------


def get_project_memory_prompt(workspace_root: str) -> str:
    """Build the project memory prompt section if learning is enabled.

    This is the main entry point called from the prompt builder.  It:
    1. Checks .ambient/config.json for opt-in
    2. Reads all learned files from docs/learned/
    3. Formats them into a ## Project Memory section

    All failures are non-fatal -- returns empty string on any error.
    """
    try:
        if not is_learning_enabled(workspace_root):
            return ""

        entries = read_learned_entries(workspace_root)
        if not entries:
            return ""

        return build_project_memory_prompt(entries)
    except Exception as exc:
        logger.warning("Failed to build project memory prompt: %s", exc)
        return ""

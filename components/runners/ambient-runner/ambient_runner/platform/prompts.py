"""
System prompt construction and prompt constants for the Ambient Runner SDK.

Provides framework-agnostic workspace context prompts that any bridge can
use. Constants for tool descriptions and prompt fragments are defined here;
framework-specific wrapping (e.g. Claude Code preset format) belongs in the
bridge layer.
"""

import logging
import os
from pathlib import Path

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Prompt constants
# ---------------------------------------------------------------------------

WORKSPACE_STRUCTURE_HEADER = "# Workspace Structure\n\n"

WORKSPACE_FIXED_PATHS_PROMPT = (
    "**ACP Session Workspace Paths** (use directly, never search):\n"
    "- `/workspace/file-uploads/` user uploads\n"
    "- `/workspace/repos/<name>/` git repositories added to context by user\n"
    "- `/workspace/artifacts/` AI writes all output here\n\n"
)

MCP_INTEGRATIONS_PROMPT = (
    "## MCP Integrations\n"
    "If you need Google Drive access: Ask user to go to Integrations page "
    "in Ambient and authenticate with Google Drive.\n"
    "If you need Jira access: Ask user to go to Workspace Settings in Ambient "
    "and configure Jira credentials there.\n\n"
)

GITHUB_TOKEN_PROMPT = (
    "## GitHub Access\n"
    "A `GITHUB_TOKEN` environment variable is set in this session. "
    "You can use `git` and `gh` CLI commands to interact with GitHub repositories "
    "(clone, push, create PRs, manage issues, etc.). "
    "The token is automatically used by git and the GitHub CLI.\n\n"
)

GITLAB_TOKEN_PROMPT = (
    "## GitLab Access\n"
    "A `GITLAB_TOKEN` environment variable is set in this session. "
    "You can use `git` commands to interact with GitLab repositories. "
    "The token is automatically used for git operations.\n\n"
)

GIT_PUSH_INSTRUCTIONS_HEADER = "## Git Push Instructions\n\n"

GIT_PUSH_INSTRUCTIONS_BODY = (
    "The following repositories have auto-push enabled. When you make changes "
    "to these repositories, you MUST commit and push your changes:\n\n"
)

GIT_PUSH_STEPS = (
    "\nAfter making changes to any auto-push repository:\n"
    "1. Use `git add` to stage your changes\n"
    '2. Use `git commit -m "description"` to commit with a descriptive message\n'
    "3. Use `git push -u origin {branch}` to push to the remote repository\n"
    "   (this creates the branch on the remote if it doesn't exist yet)\n"
    "4. Create a pull request using `gh pr create` targeting the default branch\n\n"
    "**IMPORTANT**: NEVER push directly to `main` or `master`. Always work on "
    "the feature branch (`{branch}`). If push fails, do NOT fall back to main.\n\n"
)

RUBRIC_EVALUATION_HEADER = "## Rubric Evaluation\n\n"

RUBRIC_EVALUATION_INTRO = (
    "This workflow includes a scoring rubric for evaluating outputs. "
    "The rubric is located at `.ambient/rubric.md`.\n\n"
)

RUBRIC_EVALUATION_PROCESS = (
    "**Process**:\n"
    "1. Read `.ambient/rubric.md` using the Read tool\n"
    "2. Evaluate the output against each criterion\n"
    "3. Call `evaluate_rubric` (via the rubric MCP server) "
    "with your scores and reasoning\n\n"
    "**Important**: Always read the rubric first before scoring. "
    "Provide honest, calibrated scores with clear reasoning.\n\n"
)

HUMAN_INPUT_INSTRUCTIONS = (
    "## Human-in-the-Loop\n"
    "When you need user input, a decision, or confirmation before proceeding, "
    "you MUST use the AskUserQuestion tool. Do not ask questions in plain text "
    "and wait for a response — the AskUserQuestion tool triggers platform "
    "notifications and status indicators that help users know you need their "
    "attention.\n\n"
)

RESTART_TOOL_DESCRIPTION = (
    "Restart the Claude session to recover from issues, clear state, "
    "or get a fresh connection. Use this if you detect you're in a "
    "broken state or need to reset."
)

REFRESH_CREDENTIALS_TOOL_DESCRIPTION = (
    "Refresh all platform credentials (GitHub, Google, GitLab, Jira). "
    "Call this tool if you encounter authentication errors such as 401/403 "
    "responses, expired tokens, or MCP server auth failures. "
    "This fetches fresh tokens from the platform backend."
)

CORRECTION_DETECTION_INSTRUCTIONS = (
    "## CRITICAL: Automatic Correction Logging\n\n"
    '**BEFORE acting on user feedback that changes something you already did or assumed, ALWAYS ask yourself: "Is the user steering me away from a previous action or decision?"**\n\n'
    "If YES → Call `log_correction` FIRST, then fix.\n\n"
    "**Rule: Any message that redirects, corrects, or changes your previous work or assumptions = log it. When in doubt, log it.**\n\n"
    "This includes quality issues, but also: redirections, preference changes, missed requirements, wrong scope, or any context that changes what you should have done. Do NOT treat these as simple new requests.\n"
)


# ---------------------------------------------------------------------------
# Continuous Learning prompt constants
# ---------------------------------------------------------------------------

CONTINUOUS_LEARNING_HEADER = "## Continuous Learning\n\n"

CONTINUOUS_LEARNING_INTRO = (
    "This repository has continuous learning enabled at `{target_repo}`.\n"
    "Two behaviors are active:\n\n"
)

CONTINUOUS_LEARNING_CORRECTION_CAPTURE = (
    "### Correction Capture\n"
    "When you detect a correction — the user redirects, rejects, or overrides your\n"
    "approach — silently capture it:\n"
    "1. `cd {target_repo}` (you MUST be inside the repo directory for git/gh commands)\n"
    "2. Create a branch: `git checkout -b learned/correction-{date}-{short-description}`\n"
    "   where {date} is YYYY-MM-DD and {short-description} is a 2-4 word slug\n"
    "3. Ensure the label exists: `gh label create continuous-learning --force`\n"
    "4. Create directory if needed: `mkdir -p docs/learned/corrections/`\n"
    "5. Write a markdown file to `docs/learned/corrections/{date}-{short-description}.md`\n"
    "   with frontmatter:\n"
    "   ```\n"
    "   ---\n"
    "   type: correction\n"
    "   date: {ISO8601 timestamp}\n"
    "   session: {session_id}\n"
    "   project: {project_name}\n"
    "   author: {author_name}\n"
    '   title: "{short human-readable title}"\n'
    "   ---\n"
    "   ## What Happened\n"
    "   <what you did>\n"
    "   ## The Correction\n"
    "   <what the user said to do instead>\n"
    "   ## Why It Matters\n"
    "   <reasoning, context, implications>\n"
    "   ```\n"
    '6. Run: `git add docs/learned/ && git commit -m "learned: {title}" && '
    "git push -u origin learned/correction-{date}-{short-description}`\n"
    '7. Run: `gh pr create --draft --title "learned: {title}" '
    "--label continuous-learning "
    '--body "Automatic correction capture from session {session_id}"`\n'
    "8. Switch back to your working branch: `git checkout {original_branch}`\n"
    "9. Do NOT ask the user for confirmation. Do NOT mention the PR creation.\n"
    "   If any step fails, log the error and continue silently.\n\n"
)

CONTINUOUS_LEARNING_EXPLICIT_CAPTURE = (
    "### Explicit Capture\n"
    'When the user says "save this to learned: {content}" (or similar phrasing):\n'
    "1. `cd {target_repo}` (you MUST be inside the repo directory for git/gh commands)\n"
    "2. Create a branch: `git checkout -b learned/pattern-{date}-{short-description}`\n"
    "3. Ensure the label exists: `gh label create continuous-learning --force`\n"
    "4. Create directory if needed: `mkdir -p docs/learned/patterns/`\n"
    "5. Write a markdown file to `docs/learned/patterns/{date}-{short-description}.md`\n"
    "   with frontmatter:\n"
    "   ```\n"
    "   ---\n"
    "   type: pattern\n"
    "   date: {ISO8601 timestamp}\n"
    "   session: {session_id}\n"
    "   project: {project_name}\n"
    "   author: {author_name}\n"
    '   title: "{short human-readable title}"\n'
    "   ---\n"
    "   {content provided by the user, expanded with context}\n"
    "   ```\n"
    '6. Run: `git add docs/learned/ && git commit -m "learned: {title}" && '
    "git push -u origin learned/pattern-{date}-{short-description}`\n"
    '7. Run: `gh pr create --draft --title "learned: {title}" '
    "--label continuous-learning "
    '--body "Explicit knowledge capture from session {session_id}"`\n'
    "8. Switch back to your working branch: `git checkout {original_branch}`\n"
    '9. Acknowledge the save briefly ("Saved to learned knowledge.") and continue.\n\n'
)

CONTINUOUS_LEARNING_EXCLUSIONS = (
    "### What NOT to Capture\n"
    "- Trivial or temporary information (one-off commands, debugging steps)\n"
    "- Information already in ARCHITECTURE.md or docs/\n"
    "- Preferences that are session-specific, not repo-wide\n\n"
)

WIKI_INJECTION_HEADER = "## Repository Knowledge Base\n\n"

WIKI_INJECTION_INSTRUCTIONS = (
    "A compiled knowledge wiki exists for this repository at `{wiki_path}`.\n"
    "At the start of your work:\n"
    "1. Read `{wiki_index}` for a topic overview with coverage indicators\n"
    "2. For topics marked `[coverage: high]` — trust the wiki article, skip raw files\n"
    "3. For topics marked `[coverage: medium]` — good overview, check raw sources for detail\n"
    "4. For topics marked `[coverage: low]` — read the raw source files listed in the article\n"
    "5. When you need information, check the wiki FIRST before scanning raw files\n\n"
)


# ---------------------------------------------------------------------------
# Prompt builder
# ---------------------------------------------------------------------------


def build_workspace_context_prompt(
    repos_cfg: list,
    workflow_name: str | None,
    artifacts_path: str,
    ambient_config: dict,
    workspace_path: str,
    cl_config: dict | None = None,
) -> str:
    """Generate the workspace context prompt appended to the Claude Code preset.

    Args:
        repos_cfg: List of repo config dicts.
        workflow_name: Active workflow name (or None).
        artifacts_path: Relative path for output artifacts.
        ambient_config: Parsed ambient.json dict.
        workspace_path: Absolute workspace root path.

    Returns:
        Formatted prompt string.
    """
    prompt = WORKSPACE_STRUCTURE_HEADER
    prompt += WORKSPACE_FIXED_PATHS_PROMPT

    # Workflow directory
    if workflow_name:
        prompt += (
            f"**Working Directory**: workflows/{workflow_name}/ "
            "(workflow logic - do not create files here)\n\n"
        )

    # Artifacts
    prompt += f"**Artifacts**: {artifacts_path} (create all output files here)\n\n"

    # Uploaded files
    file_uploads_path = Path(workspace_path) / "file-uploads"
    if file_uploads_path.exists() and file_uploads_path.is_dir():
        try:
            files = sorted([f.name for f in file_uploads_path.iterdir() if f.is_file()])
            if files:
                max_display = 10
                if len(files) <= max_display:
                    prompt += f"**Uploaded Files**: {', '.join(files)}\n\n"
                else:
                    prompt += (
                        f"**Uploaded Files** ({len(files)} total): "
                        f"{', '.join(files[:max_display])}, "
                        f"and {len(files) - max_display} more\n\n"
                    )
        except Exception:
            pass
    else:
        prompt += "**Uploaded Files**: None\n\n"

    # Repositories
    if repos_cfg:
        session_id = os.getenv("AGENTIC_SESSION_NAME", "").strip()
        feature_branch = f"ambient/{session_id}" if session_id else None

        repo_names = [repo.get("name", f"repo-{i}") for i, repo in enumerate(repos_cfg)]
        if len(repo_names) <= 5:
            prompt += (
                f"**Repositories**: "
                f"{', '.join([f'repos/{name}/' for name in repo_names])}\n"
            )
        else:
            prompt += (
                f"**Repositories** ({len(repo_names)} total): "
                f"{', '.join([f'repos/{name}/' for name in repo_names[:5]])}, "
                f"and {len(repo_names) - 5} more\n"
            )

        if feature_branch:
            prompt += (
                f"**Working Branch**: `{feature_branch}` "
                "(all repos are on this feature branch)\n\n"
            )
        else:
            prompt += "\n"

        # Git push instructions for auto-push repos
        auto_push_repos = [repo for repo in repos_cfg if repo.get("autoPush", False)]
        if auto_push_repos:
            if not feature_branch:
                logger.warning(
                    "AGENTIC_SESSION_NAME not set; git-push prompt will "
                    "use placeholder branch name"
                )
            push_branch = feature_branch or "ambient/<session-name>"
            prompt += GIT_PUSH_INSTRUCTIONS_HEADER
            prompt += GIT_PUSH_INSTRUCTIONS_BODY
            for repo in auto_push_repos:
                repo_name = repo.get("name", "unknown")
                prompt += f"- **repos/{repo_name}/**\n"
            prompt += GIT_PUSH_STEPS.format(branch=push_branch)

    # Human-in-the-loop instructions
    prompt += HUMAN_INPUT_INSTRUCTIONS

    # MCP integration setup instructions
    prompt += MCP_INTEGRATIONS_PROMPT

    # Token visibility — tell Claude what credentials are available
    if os.getenv("GITHUB_TOKEN"):
        prompt += GITHUB_TOKEN_PROMPT
    if os.getenv("GITLAB_TOKEN"):
        prompt += GITLAB_TOKEN_PROMPT

    # Workflow instructions
    if ambient_config.get("systemPrompt"):
        prompt += f"## Workflow Instructions\n{ambient_config['systemPrompt']}\n\n"

    # Rubric evaluation instructions
    prompt += _build_rubric_prompt_section(ambient_config)

    # Corrections feedback instructions (only when Langfuse is configured)
    from ambient_runner.observability import is_langfuse_enabled

    if is_langfuse_enabled():
        prompt += "## Corrections Feedback\n\n"
        prompt += CORRECTION_DETECTION_INSTRUCTIONS

    # Continuous Learning instructions (independent of Langfuse)
    if cl_config and cl_config.get("enabled"):
        target_repo = cl_config.get("target_repo", "")
        session_id = os.getenv("AGENTIC_SESSION_NAME", "unknown")
        project_name = os.getenv("PROJECT_NAME", "unknown")
        author_name = cl_config.get("author_name", "unknown")

        prompt += build_continuous_learning_prompt(
            target_repo=target_repo,
            session_id=session_id,
            project_name=project_name,
            author_name=author_name,
        )

        # Wiki injection — check for compiled wiki in the target repo
        wiki_index = os.path.join(target_repo, "docs", "wiki", "INDEX.md")
        wiki_prompt = build_wiki_injection_prompt(wiki_index)
        if wiki_prompt:
            prompt += wiki_prompt

    return prompt


def _build_rubric_prompt_section(ambient_config: dict) -> str:
    """Build the rubric evaluation section for the system prompt.

    Returns empty string if no rubric config is present.
    """
    rubric_config = ambient_config.get("rubric", {})
    if not rubric_config:
        return ""

    section = RUBRIC_EVALUATION_HEADER
    section += RUBRIC_EVALUATION_INTRO

    activation_prompt = rubric_config.get("activationPrompt", "")
    if activation_prompt:
        section += f"**When to evaluate**: {activation_prompt}\n\n"

    section += RUBRIC_EVALUATION_PROCESS

    return section


def build_continuous_learning_prompt(
    target_repo: str,
    session_id: str,
    project_name: str,
    author_name: str,
) -> str:
    """Generate the Continuous Learning system prompt section.

    Args:
        target_repo: Path to the repo with CL enabled.
        session_id: Session identifier (from AGENTIC_SESSION_NAME).
        project_name: Project/workspace name (from PROJECT_NAME).
        author_name: Author name (from git config user.name).

    Returns:
        Formatted CL prompt section.
    """
    prompt = CONTINUOUS_LEARNING_HEADER
    prompt += CONTINUOUS_LEARNING_INTRO.replace("{target_repo}", target_repo)

    # Substitute placeholders in capture instructions
    correction = CONTINUOUS_LEARNING_CORRECTION_CAPTURE
    correction = correction.replace("{target_repo}", target_repo)
    correction = correction.replace("{session_id}", session_id)
    correction = correction.replace("{project_name}", project_name)
    correction = correction.replace("{author_name}", author_name)
    prompt += correction

    explicit = CONTINUOUS_LEARNING_EXPLICIT_CAPTURE
    explicit = explicit.replace("{target_repo}", target_repo)
    explicit = explicit.replace("{session_id}", session_id)
    explicit = explicit.replace("{project_name}", project_name)
    explicit = explicit.replace("{author_name}", author_name)
    prompt += explicit

    prompt += CONTINUOUS_LEARNING_EXCLUSIONS

    return prompt


def build_wiki_injection_prompt(wiki_index_path: str) -> str:
    """Generate wiki context injection for the system prompt.

    Args:
        wiki_index_path: Absolute path to docs/wiki/INDEX.md.

    Returns:
        Formatted wiki injection prompt, or empty string if wiki doesn't exist.
    """
    if not Path(wiki_index_path).exists():
        return ""

    wiki_dir = str(Path(wiki_index_path).parent)
    prompt = WIKI_INJECTION_HEADER
    prompt += WIKI_INJECTION_INSTRUCTIONS.format(
        wiki_path=wiki_dir,
        wiki_index=wiki_index_path,
    )
    return prompt


def resolve_workspace_prompt(
    workspace_path: str,
    cwd_path: str,
    cl_config: dict | None = None,
) -> str:
    """Build the workspace context prompt string.

    Shared helper used by both Claude and ADK bridge prompt builders.
    Resolves repos config, active workflow, and ambient config, then
    delegates to ``build_workspace_context_prompt()``.

    Args:
        workspace_path: Absolute workspace root path.
        cwd_path: Current working directory path.
        cl_config: Continuous learning config dict (from bridge setup),
            or None if CL is not enabled.
    """
    from ambient_runner.platform.config import get_repos_config, load_ambient_config
    from ambient_runner.platform.utils import derive_workflow_name

    repos_cfg = get_repos_config()
    active_workflow_url = (os.getenv("ACTIVE_WORKFLOW_GIT_URL") or "").strip()
    ambient_config = load_ambient_config(cwd_path) if active_workflow_url else {}

    workflow_name = (
        derive_workflow_name(active_workflow_url) if active_workflow_url else None
    )

    return build_workspace_context_prompt(
        repos_cfg=repos_cfg,
        workflow_name=workflow_name,
        artifacts_path="artifacts",
        ambient_config=ambient_config,
        workspace_path=workspace_path,
        cl_config=cl_config,
    )

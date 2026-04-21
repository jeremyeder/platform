# components/runners/ambient-runner/ag_ui_cursor_cli/types.py
"""Dataclasses for Cursor CLI stream-json event types."""

import json
import logging
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class InitEvent:
    type: str  # "system"
    subtype: str  # "init"
    session_id: str = ""
    model: str = ""


@dataclass
class MessageEvent:
    type: str  # "assistant" or "user"
    content: str = ""
    delta: bool = False


@dataclass
class ToolCallStartEvent:
    type: str  # "tool_call"
    subtype: str  # "started"
    tool_id: str = ""
    tool_name: str = ""
    arguments: str = ""


@dataclass
class ToolCallCompletedEvent:
    type: str  # "tool_call"
    subtype: str  # "completed"
    tool_id: str = ""
    output: str = ""
    error: str = ""


@dataclass
class ResultEvent:
    type: str  # "result"
    subtype: str  # "success" or "error"
    result: str = ""
    session_id: str = ""
    duration_ms: int = 0
    is_error: bool = False


def parse_event(
    line: str,
) -> InitEvent | MessageEvent | ToolCallStartEvent | ToolCallCompletedEvent | ResultEvent | None:
    """Parse a JSON line into the appropriate event dataclass.

    Returns None when the line cannot be parsed or has an unknown type.

    NOTE: The Cursor CLI stream-json event format is based on documentation
    research and may differ from actual CLI output. Validate against a real
    Cursor CLI binary before relying on this in production.
    """
    try:
        data = json.loads(line)
    except json.JSONDecodeError:
        logger.warning("Failed to parse JSONL line: %s", line[:120])
        return None

    event_type = data.get("type")
    subtype = data.get("subtype", "")

    if event_type == "system" and subtype == "init":
        return InitEvent(
            type=event_type,
            subtype=subtype,
            session_id=data.get("session_id", ""),
            model=data.get("model", ""),
        )

    if event_type == "assistant":
        msg = data.get("message", {})
        content = msg.get("content", "") if isinstance(msg, dict) else ""
        return MessageEvent(
            type=event_type,
            content=content,
            delta=data.get("delta", False),
        )

    if event_type == "user":
        msg = data.get("message", {})
        content = msg.get("content", "") if isinstance(msg, dict) else ""
        return MessageEvent(
            type=event_type,
            content=content,
            delta=False,
        )

    if event_type == "tool_call" and subtype == "started":
        tc = data.get("tool_call", {})
        func = tc.get("function", {})
        return ToolCallStartEvent(
            type=event_type,
            subtype=subtype,
            tool_id=data.get("id", ""),
            tool_name=func.get("name", ""),
            arguments=func.get("arguments", ""),
        )

    if event_type == "tool_call" and subtype == "completed":
        return ToolCallCompletedEvent(
            type=event_type,
            subtype=subtype,
            tool_id=data.get("id", ""),
            output=data.get("output", ""),
            error=data.get("error", ""),
        )

    if event_type == "result":
        return ResultEvent(
            type=event_type,
            subtype=subtype,
            result=data.get("result", ""),
            session_id=data.get("session_id", ""),
            duration_ms=data.get("duration_ms", 0),
            is_error=data.get("is_error", False),
        )

    logger.debug("Unknown Cursor CLI event: type=%s subtype=%s", event_type, subtype)
    return None

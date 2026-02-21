from __future__ import annotations

from dataclasses import dataclass, field
from threading import Event
from typing import Callable, List, Optional


@dataclass
class ReplyContext:
    """Context of the message being replied to."""

    role: str
    """Role of the original sender: 'user' or 'agent'."""
    content: str
    """Content of the original message."""
    sender_agent_name: Optional[str] = None
    """Name of the agent that sent the original message (if agent role)."""


@dataclass
class MemberInfo:
    """Info about an agent member in a group conversation."""

    agent_id: str
    """Agent UUID."""
    agent_name: str
    """Agent display name."""


@dataclass
class Task:
    """Context passed to the task handler."""

    task_id: str
    """Unique task ID assigned by the server."""
    conversation_id: str
    """Conversation ID this task belongs to."""
    content: str
    """The user's message content."""
    send_chunk: Callable[[str], None]
    """Send a streaming delta (new characters only) to the user."""
    send_complete: Callable[[str], None]
    """Mark the task as complete with the full response content."""
    send_error: Callable[[str], None]
    """Mark the task as failed with an error message."""
    conversation_type: Optional[str] = None
    """Conversation type: 'direct' or 'group'."""
    members: Optional[List[MemberInfo]] = None
    """Other agents in the conversation (for group conversations)."""
    reply_to: Optional[ReplyContext] = None
    """The message being replied to, if this is a reply."""
    cancelled: Event = field(default_factory=Event)
    """Event that is set when the user cancels the stream. Check task.cancelled.is_set() to stop generation early."""

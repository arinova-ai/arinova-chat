from __future__ import annotations

from dataclasses import dataclass
from typing import Callable


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

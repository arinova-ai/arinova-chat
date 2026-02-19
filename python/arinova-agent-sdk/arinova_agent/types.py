from __future__ import annotations

from dataclasses import dataclass
from typing import Callable


@dataclass
class Task:
    """Context passed to the task handler."""

    task_id: str
    conversation_id: str
    content: str
    send_chunk: Callable[[str], None]
    send_complete: Callable[[str], None]
    send_error: Callable[[str], None]

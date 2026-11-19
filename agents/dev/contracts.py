from __future__ import annotations
from typing import Literal
from pydantic import Field
from core.contracts import _Strict

MAX_TASK_CHARS = 500
MAX_CODE_CHARS = 8000
MAX_EXPLANATION_CHARS = 600
MAX_LINES = 250


class DevRequest(_Strict):
    action: Literal["write", "review"]
    task: str | None = Field(default=None, min_length=10, max_length=MAX_TASK_CHARS)
    code: str | None = Field(default=None, max_length=MAX_CODE_CHARS)


class DevProposal(_Strict):
    filename: str = Field(pattern=r"^[A-Za-z0-9_\-]{1,40}\.py$")
    code: str = Field(min_length=1, max_length=MAX_CODE_CHARS)
    explanation: str = Field(default="", max_length=MAX_EXPLANATION_CHARS)

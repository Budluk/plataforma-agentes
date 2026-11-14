from __future__ import annotations
from typing import Literal
from pydantic import Field
from core.contracts import _Strict


class DevRequest(_Strict):
    action: Literal["write", "review"]
    task: str | None = Field(default=None, min_length=10, max_length=500)
    code: str | None = Field(default=None, max_length=8000)


class DevProposal(_Strict):
    filename: str = Field(pattern=r"^[A-Za-z0-9_\-]{1,40}\.py$")
    code: str = Field(min_length=1, max_length=8000)
    explanation: str = Field(default="", max_length=600)

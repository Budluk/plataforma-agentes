from __future__ import annotations
from typing import Literal
from pydantic import Field
from core.contracts import _Strict

AREAS = ("finance", "music", "sales", "funnel", "research", "dev")


class RouteDecision(_Strict):
    area: Literal["finance", "music", "sales", "funnel", "research", "dev", "none"]
    reason: str = Field(default="", max_length=200)

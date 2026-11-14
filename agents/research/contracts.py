from __future__ import annotations
from pydantic import Field
from core.contracts import _Strict


class ResearchRequest(_Strict):
    url: str = Field(min_length=10, max_length=300)
    question: str = Field(min_length=3, max_length=300)


class ResearchSummary(_Strict):
    summary: str = Field(min_length=1, max_length=1200)
    key_points: list[str] = Field(default_factory=list, max_length=5)
    answers_question: bool

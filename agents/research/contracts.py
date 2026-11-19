from __future__ import annotations
from pydantic import Field
from core.contracts import _Strict

MAX_SUMMARY_CHARS = 900
MAX_KEY_POINTS = 5


class ResearchRequest(_Strict):
    url: str = Field(min_length=10, max_length=300)
    question: str = Field(min_length=3, max_length=300)


class ResearchSummary(_Strict):
    summary: str = Field(min_length=1, max_length=MAX_SUMMARY_CHARS)
    key_points: list[str] = Field(default_factory=list, max_length=MAX_KEY_POINTS)
    answers_question: bool

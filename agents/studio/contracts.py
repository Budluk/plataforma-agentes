from __future__ import annotations
from typing import Literal
from pydantic import Field
from core.contracts import _Strict

PROJECT_ID_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"


class StudioRequest(_Strict):
    """Pedido da área studio. Lista fechada de ações e nada além dela."""

    action: Literal["health", "list", "create", "status", "validate"]
    prompt: str | None = Field(default=None, min_length=10, max_length=2000)
    project_id: str | None = Field(default=None, pattern=PROJECT_ID_PATTERN)

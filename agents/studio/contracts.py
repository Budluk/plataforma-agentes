from __future__ import annotations
from typing import Literal
from pydantic import Field
from core.contracts import _Strict

PROJECT_ID_PATTERN = r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"

# Lista fechada. Nome interno em snake_case; o hífen só existe na rota HTTP.
ACTIONS = ("health", "list", "create", "status", "validate", "messages",
           "fix", "fix_validation", "rebuild", "retry", "import",
           "versions", "restore")
IMPORT_KINDS = ("site", "github", "app")


class StudioRequest(_Strict):
    """Pedido da área studio. Lista fechada de ações e nada além dela."""

    action: Literal["health", "list", "create", "status", "validate", "messages",
                    "fix", "fix_validation", "rebuild", "retry", "import",
                    "versions", "restore"]
    prompt: str | None = Field(default=None, min_length=10, max_length=2000)
    project_id: str | None = Field(default=None, pattern=PROJECT_ID_PATTERN)
    message: str | None = Field(default=None, min_length=2, max_length=2000)
    url: str | None = Field(default=None, min_length=12, max_length=2048)
    kind: Literal["site", "github", "app"] | None = None
    version: int | None = Field(default=None, ge=1, le=1_000_000)

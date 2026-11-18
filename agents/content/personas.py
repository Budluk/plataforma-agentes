from __future__ import annotations

import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field


class PersonaInvalida(Exception):
    pass


class Persona(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    schema_version: int = Field(default=1, ge=1)
    credential_reference: str | None = Field(default=None, max_length=200)
    persona_id: str = Field(min_length=1, max_length=40)
    enabled: bool = False
    language: str = Field(min_length=2, max_length=10)
    niche: str = Field(max_length=200)
    editorial_identity: str = Field(max_length=200)
    style: str = Field(max_length=300)
    allowed_topics: list[str] = Field(default_factory=list, max_length=50)
    forbidden_topics: list[str] = Field(default_factory=list, max_length=50)
    accounts: list[str] = Field(default_factory=list, max_length=50)
    require_sources_for_factual_claims: bool = True


def carregar_persona(caminho: str | Path) -> Persona:
    """Le e valida uma persona. Falha fechada: qualquer erro recusa."""

    caminho = Path(caminho)

    if not caminho.is_file():
        raise PersonaInvalida(f"arquivo nao encontrado: {caminho}")

    try:
        dados = json.loads(caminho.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, UnicodeDecodeError) as exc:
        raise PersonaInvalida(f"JSON invalido: {exc}") from None

    if not isinstance(dados, dict):
        raise PersonaInvalida("persona precisa ser um objeto JSON")

    try:
        return Persona.model_validate(dados)
    except Exception as exc:
        raise PersonaInvalida(f"persona fora do contrato: {exc}") from None


def exigir_persona_ativa(persona: Persona) -> None:
    if not persona.enabled:
        raise PersonaInvalida(
            f"persona {persona.persona_id!r} esta desabilitada"
        )

    if not persona.accounts:
        raise PersonaInvalida(
            f"persona {persona.persona_id!r} sem conta autorizada"
        )


def tema_permitido(persona: Persona, tema: str) -> bool:
    alvo = tema.lower()

    for proibido in persona.forbidden_topics:
        if proibido.lower() in alvo:
            return False

    if not persona.allowed_topics:
        return True

    return any(item.lower() in alvo for item in persona.allowed_topics)

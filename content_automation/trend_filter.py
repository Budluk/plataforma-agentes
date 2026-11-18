from __future__ import annotations

from content_automation.trends import TrendCandidate


def filtrar_por_temas(
    candidatos: list[TrendCandidate],
    permitidos: list[str],
    proibidos: list[str] | None = None,
) -> list[TrendCandidate]:
    """Mantem so o que casa com os temas da persona.

    A comparacao e por palavra do tema dentro do titulo, sem diferenciar
    maiuscula. Lista de permitidos vazia deixa passar tudo, menos os
    proibidos.
    """

    if not isinstance(candidatos, list):
        raise TypeError("candidatos deve ser lista")

    for nome, lista in (
        ("permitidos", permitidos),
        ("proibidos", proibidos or []),
    ):
        if not isinstance(lista, list):
            raise TypeError(f"{nome} deve ser lista")
        for item in lista:
            if not isinstance(item, str) or not item.strip():
                raise ValueError(f"{nome}: item vazio ou nao textual")

    bloqueio = [p.strip().lower() for p in (proibidos or [])]
    aprovacao = [p.strip().lower() for p in permitidos]

    resultado: list[TrendCandidate] = []

    for candidato in candidatos:
        titulo = candidato.topic.lower()

        if any(p in titulo for p in bloqueio):
            continue

        if aprovacao and not any(p in titulo for p in aprovacao):
            continue

        resultado.append(candidato)

    return resultado


def resumir(candidatos: list[TrendCandidate]) -> dict:
    """Contagem simples, para o log dizer o que passou e o que foi barrado."""

    return {
        "total": len(candidatos),
        "temas": [c.topic for c in candidatos],
        "trafego_total": sum(
            c.views for c in candidatos if c.views is not None
        ),
    }

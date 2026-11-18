"""Coleta o feed RSS do Google Trends e grava no banco.

Somente leitura. Nada e publicado e nada e proposto: os candidatos
viram observacoes no banco de tendencias, e nada mais.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from agents.content.personas import (
    PersonaInvalida,
    carregar_persona,
    exigir_persona_ativa,
)
from content_automation.trend_filter import filtrar_por_temas, resumir
from content_automation.trend_store import TrendStore
from content_automation.trends_source_rss import RssTrendsSourceComRede


class FakeMemory:
    def record_run(self, agent, pessoa, status, detalhe):
        return None


class FakeLogger:
    def __init__(self):
        self.eventos = []

    def log(self, evento, **campos):
        self.eventos.append((evento, campos))


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Coleta o feed de tendencias e grava no banco."
    )
    parser.add_argument("--regiao", default="BR")
    parser.add_argument("--persona", default=None,
                        help="filtra pelos temas desta persona")
    parser.add_argument("--db", type=Path,
                        default=ROOT / "data" / "trends.sqlite3")
    parser.add_argument("--sem-filtro", action="store_true",
                        help="grava tudo, sem filtrar por nicho")
    args = parser.parse_args(argv)

    permitidos: list[str] = []
    proibidos: list[str] = []

    if args.persona and not args.sem_filtro:
        caminho = ROOT / "config" / "personas" / (args.persona + ".json")
        try:
            persona = carregar_persona(caminho)
            exigir_persona_ativa(persona)
        except PersonaInvalida as exc:
            print("Persona recusada:", exc)
            return 1
        permitidos = persona.allowed_topics
        proibidos = persona.forbidden_topics
        print("Persona:", persona.persona_id)
        print("Temas permitidos:", ", ".join(permitidos))

    fonte = RssTrendsSourceComRede(args.regiao)

    print("Lendo feed do Google Trends para", args.regiao, "...")

    try:
        brutos = fonte.collect()
    except Exception as exc:
        print("Falha na coleta:", type(exc).__name__, exc)
        return 1

    print("Tendencias no feed:", len(brutos))

    if args.sem_filtro:
        escolhidos = brutos
    else:
        escolhidos = filtrar_por_temas(brutos, permitidos, proibidos)

    print("Depois do filtro:", len(escolhidos))
    print()

    store = TrendStore(args.db)

    novas = 0
    duplicadas = 0
    recusadas = 0

    for candidato in escolhidos:
        try:
            if store.save(candidato):
                novas += 1
            else:
                duplicadas += 1
        except (ValueError, TypeError):
            recusadas += 1

    print("Gravadas:", novas, "| duplicadas:", duplicadas, "| recusadas:", recusadas)

    if escolhidos:
        resumo = resumir(escolhidos)
        print("Trafego somado:", resumo["trafego_total"])
        print()
        for candidato in escolhidos:
            print("  ", candidato.topic, "|", candidato.views)

    print()
    print("Nada foi publicado.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

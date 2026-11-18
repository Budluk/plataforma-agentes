from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from content_automation.manual_import import import_observations
from content_automation.trend_growth import compare_growth
from content_automation.trend_history import restore_candidate
from content_automation.trend_windows import select_frame
from content_automation.trend_store import TrendStore

DEFAULT_DB = ROOT / "data" / "trends.sqlite3"


def format_number(value: float | None, digits: int = 2) -> str:
    if value is None:
        return "n/d"
    return f"{value:,.{digits}f}"


def build_rows(
    store: TrendStore,
    *,
    mode: str = "latest",
    window_hours: int = 24,
) -> list[dict]:
    """Um resumo por conteudo, nunca por semente de pauta."""
    observations = store.list_observations(limit=1000)

    seen: list[tuple[str, str, str, str]] = []
    for row in observations:
        key = (
            row["source"],
            row["url"],
            row["language"],
            row["region"],
        )
        if key not in seen:
            seen.append(key)

    results: list[dict] = []

    for source, url, language, region in seen:
        rows = store.observations_by_key(
            source, url, language, region
        )

        frame = select_frame(
            rows, mode=mode, window_hours=window_hours
        )

        if frame is None:
            results.append({
                "topic": next(
                    row["topic"] for row in observations
                    if row["url"] == url
                    and row["source"] == source
                ),
                "url": url,
                "observations": len(rows),
                "observations_in_frame": 0,
                "mode": mode,
                "recorte": f"{mode} (0/{len(rows)})",
                "status": "insufficient_history",
                "reason": (
                    "Menos de duas observacoes no recorte"
                    " escolhido"
                ),
                "delta_views": None,
                "growth_pct": None,
                "views_per_hour": None,
            })
            continue

        growth = compare_growth(
            restore_candidate(frame.previous),
            restore_candidate(frame.current),
        )

        results.append({
            "topic": next(
                row["topic"] for row in observations
                if row["url"] == url and row["source"] == source
            ),
            "url": url,
            "observations": len(rows),
            "observations_in_frame": frame.observations_in_frame,
            "mode": frame.mode,
            "recorte": f"{frame.mode} ({frame.observations_in_frame}/{len(rows)})",
            "status": growth.status,
            "reason": growth.reason,
            "delta_views": growth.delta_views if growth else None,
            "growth_pct": growth.growth_pct if growth else None,
            "views_per_hour": growth.views_per_hour if growth else None,
        })

    results.sort(
        key=lambda item: (
            item["views_per_hour"] is None,
            -(item["views_per_hour"] or 0.0),
        )
    )

    return results


def print_report(results: list[dict]) -> None:
    if not results:
        print("Nenhuma observacao registrada.")
        return

    print("")
    print("Crescimento por conteudo (medido no recorte escolhido)")
    print("Ordem: maior visualizacao por hora primeiro")
    print("")
    header = (
        f"{'visualizacoes/h':>15}  {'aumento':>9}  {'%':>8}  "
        f"{'obs':>4}  {'recorte':<16}  {'situacao':<20}  pauta"
    )
    print(header)
    print("-" * len(header))

    for item in results:
        print(
            f"{format_number(item['views_per_hour']):>15}  "
            f"{format_number(item['delta_views'], 0):>9}  "
            f"{format_number(item['growth_pct'], 1):>8}  "
            f"{item['observations']:>4}  "
            f"{item['recorte']:<16}  "
            f"{item['status']:<20}  "
            f"{item['topic'][:40]}"
        )

    print("")
    print("Crescimento medido nao significa tendencia viral confirmada.")

    detailed = [
        item for item in results
        if item["status"] not in ("measured",)
    ]

    if detailed:
        print("")
        print("Pendencias:")
        for item in detailed:
            print(f"  - {item['topic'][:40]}: {item['reason']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Importa observacoes manuais e mostra o crescimento."
    )
    parser.add_argument(
        "--mode",
        choices=["latest", "window", "full"],
        default="latest",
        help="recorte do historico usado na medicao",
    )
    parser.add_argument(
        "--window-hours",
        type=int,
        default=24,
        help="tamanho da janela em horas quando --mode window",
    )
    parser.add_argument(
        "--csv",
        type=Path,
        default=None,
        help="arquivo CSV preenchido a mao (opcional)",
    )
    parser.add_argument(
        "--db",
        type=Path,
        default=DEFAULT_DB,
        help=f"banco de observacoes (padrao: {DEFAULT_DB})",
    )
    args = parser.parse_args(argv)

    store = TrendStore(args.db)

    if args.csv is not None:
        if not args.csv.is_file():
            print(f"ERRO: arquivo nao encontrado: {args.csv}")
            return 1

        result = import_observations(store, args.csv)

        print(
            f"Importadas: {result.inserted} | "
            f"duplicadas: {result.duplicates} | "
            f"rejeitadas: {len(result.rejected)}"
        )

        for line, reason in result.rejected:
            print(f"  linha {line}: {reason}")

        if result.rejected:
            print("")
            print("Corrija as linhas acima e rode novamente.")

    try:
        print_report(build_rows(
            store,
            mode=args.mode,
            window_hours=args.window_hours,
        ))
    except Exception as exc:
        print(f"ERRO ao montar o relatorio: {type(exc).__name__}: {exc}")
        return 1

    print("")
    print(f"Banco: {args.db}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

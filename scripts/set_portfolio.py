import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from agents.finance.portfolio_file import parse_number, write_portfolio


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="Grava data/portfolio.json sem você editar JSON à mão.")
    ap.add_argument("--equity", required=True, help='patrimônio, ex.: "25000" ou "25000,50"')
    ap.add_argument("--pnl", required=True, help='resultado do dia em %%, ex.: "-0.4" ou "-0,4"')
    ap.add_argument("--inconsistent", action="store_true", help="marca o snapshot como inconsistente (o gate rejeita)")
    args = ap.parse_args()
    try:
        state = write_portfolio(ROOT / "data" / "portfolio.json", equity=parse_number(args.equity),
                                daily_pnl_pct=parse_number(args.pnl), consistent=not args.inconsistent)
    except ValueError as exc:
        print("ERRO:", exc)
        return 1
    print("Gravado em data/portfolio.json:", state.model_dump())
    return 0


if __name__ == "__main__":
    sys.exit(main())

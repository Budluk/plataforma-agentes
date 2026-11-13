import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core.llm_client import FakeLLM, HttpLLMClient, LLMError
from core.logger import JsonlLogger
from core.memory import Memory
from core.permissions import Permissions
from core.tool_monitor import ToolMonitor
from pipelines.funnel_pipeline import FunnelPipeline
from scripts.init_db import create_all

BASE = dict(product="Low ticket", ad_spend=500.0, visitors=2000, checkouts_started=200, front_sales=40,
            bump_sales=12, upsell_sales=4, front_price=19.9, bump_price=27.0, upsell_price=297.0,
            platform_fee_pct=10.0, tax_pct=6.0)


def j(**kw):
    d = dict(BASE)
    d.update(kw)
    return json.dumps({k: v for k, v in d.items() if v is not None})


SCENARIOS = [
    ("funil saudável -> escalar", "relatório completo", j()),
    ("lucro positivo, ROAS baixo -> manter", "x", j(ad_spend=450.0, visitors=1500, checkouts_started=120,
                                                   front_sales=30, bump_sales=5, upsell_sales=0)),
    ("prejuízo -> cortar", "x", j(ad_spend=800.0, visitors=1000, checkouts_started=60, front_sales=20,
                                  bump_sales=0, upsell_sales=0)),
    ("1 venda só (caso do vídeo) -> dados insuficientes", "x",
     j(ad_spend=17.5, visitors=100, checkouts_started=5, front_sales=1, bump_sales=0, upsell_sales=0,
       front_price=6.9)),
    ("dados incoerentes (bump > front)", "x", j(bump_sales=99)),
    ("falta a taxa da plataforma (falha fechada)", "x", j(platform_fee_pct=None)),
    ("campo de ação real", "x", j(launch_campaign=True)),
    ("LLM devolve lixo", "x", "isto não é json"),
]

LIVE_TEXT = ("Produto Low ticket. Gastei R$ 500 em anúncios. 2000 visitantes, 200 checkouts iniciados, "
             "40 vendas do front a R$ 19,90, 12 order bumps a R$ 27 e 4 upsells a R$ 297. "
             "Taxa da plataforma 10% e imposto 6%.")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="usa o LLM real no 1º cenário")
    args = ap.parse_args()
    real = None
    if args.live:
        from dotenv import load_dotenv
        load_dotenv(ROOT / ".env")
        try:
            real = HttpLLMClient("groq")
        except LLMError as exc:
            print("ERRO ao preparar LLM real:", exc)
            return 1
    db = ROOT / "data" / "sqlite.db"
    create_all(db)
    memory = Memory(db)
    for i, (name, text, fake) in enumerate(SCENARIOS):
        use_real = bool(real) and i == 0
        llm = real if use_real else FakeLLM(fake)
        pipe = FunnelPipeline(llm, memory, Permissions(db),
                              JsonlLogger(ROOT / "data" / "logs" / "funnel_demo.jsonl"), ToolMonitor())
        res = pipe.run(LIVE_TEXT if use_real else text)
        print(f"[{name}] ok={res.ok}")
        if res.data:
            d = res.data
            print(f"   decisão={d['decision']} | lucro={d['profit']} | ROAS={d['roas']} "
                  f"(equilíbrio {d['breakeven_roas']}) | CPA={d['cpa']}")
            print("   nota:", d["note"])
        for r in res.reasons:
            print("   rejeição:", r)
    print("Demo funil ok.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

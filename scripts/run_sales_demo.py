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
from pipelines.sales_pipeline import SalesPipeline
from scripts.init_db import create_all


def j(**kw):
    base = {"product": "Camiseta", "unit_cost": 40.0}
    base.update(kw)
    return json.dumps(base)


SCENARIOS = [
    ("margem", "custo 40, vendo a 100", j(action="margin", price=100.0)),
    ("preço sugerido", "margem 50%, concorrentes 70, 90 e 100",
     j(action="price", target_margin_pct=50.0, competitor_prices=[70.0, 90.0, 100.0])),
    ("ponto de equilíbrio", "custos fixos 3000", j(action="break_even", price=100.0, fixed_costs=3000.0)),
    ("venda com prejuízo", "x", j(action="margin", price=30.0)),
    ("falta custo fixo (falha fechada)", "x", j(action="break_even", price=100.0)),
    ("produto com caractere perigoso", "x", j(action="margin", price=100.0, product="x; rm -rf /")),
    ("LLM devolve lixo", "x", "isto não é json"),
    ("campo transacional extra", "x", j(action="margin", price=100.0, checkout=True)),
]


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
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
        llm = real if (real and i == 0) else FakeLLM(fake)
        if real and i == 0:
            text = "Produto Camiseta com custo unitário de 40 reais, vendida a 100 reais. Qual a margem?"
        pipe = SalesPipeline(llm, memory, Permissions(db),
                             JsonlLogger(ROOT / "data" / "logs" / "sales_demo.jsonl"), ToolMonitor())
        res = pipe.run(text)
        print(f"[{name}] ok={res.ok}")
        if res.data:
            print("   resultado:", json.dumps(res.data, ensure_ascii=False))
        for r in res.reasons:
            print("   rejeição:", r)
    print("Demo vendas ok.")
    return 0


if __name__ == "__main__":
    sys.exit(main())


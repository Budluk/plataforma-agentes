import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from agents.finance.analyst import parse_proposal  # noqa: F401 (garante import)
from core.llm_client import FakeLLM, HttpLLMClient, LLMError
from core.logger import JsonlLogger
from core.memory import Memory
from core.permissions import Permissions
from core.tool_monitor import ToolMonitor
from pipelines.finance_pipeline import FinancePipeline
from scripts.init_db import create_all

GOOD = {"equity": 10000.0, "daily_pnl_pct": -0.5, "equity_snapshot_consistent": True}
OK_JSON = json.dumps({"asset": "PETR4", "direction": "LONG", "entry_price": 38.0, "stop_price": 36.9,
                      "target_price": 41.5, "confidence": 0.7, "thesis": "demo"})
BAD_JSON = "isto não é json"

SCENARIOS = [
    ("aprovado", "PETR4", GOOD, OK_JSON),
    ("snapshot inconsistente", "PETR4", {**GOOD, "equity_snapshot_consistent": False}, OK_JSON),
    ("perda diária -5.0", "PETR4", {**GOOD, "daily_pnl_pct": -5.0}, OK_JSON),
    ("ativo fora da lista", "DOGE", GOOD, OK_JSON),
    ("LLM devolve lixo", "PETR4", GOOD, BAD_JSON),
]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="usa o LLM real (precisa do .env)")
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
    for name, asset, portfolio, resp in SCENARIOS:
        llm = real if (real and resp == OK_JSON) else FakeLLM(resp)
        pipe = FinancePipeline(llm, memory, Permissions(db), JsonlLogger(ROOT / "data" / "logs" / "demo.jsonl"),
                               ToolMonitor(), ROOT / "data" / "notes")
        res = pipe.run(asset, portfolio)
        print(f"[{name}] aprovado={res.approved}")
        if res.alert:
            print("   AlertEvent:", res.alert.model_dump_json())
        for r in res.reasons:
            print("   rejeição:", r)
    print("Alertas salvos em data/sqlite.db:", len(memory.list_alerts()))
    print("Demo ok.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

from agents.finance.market_data import HttpMarketData, load_market_hosts
from agents.finance.portfolio_file import load_portfolio
from core.llm_client import HttpLLMClient, LLMError
from core.logger import JsonlLogger
from core.memory import Memory
from core.permissions import Permissions
from core.tool_monitor import ToolMonitor
from pipelines.finance_pipeline import FinancePipeline
from scripts.init_db import create_all


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) != 2:
        print("uso: finance_live.py <ATIVO>   (ex.: PETR4, VALE3, ITUB4, BTCUSDT, EURUSD)")
        return 1
    load_dotenv(ROOT / ".env")
    try:
        llm = HttpLLMClient("groq")
    except LLMError as exc:
        print("ERRO ao preparar LLM:", exc)
        return 1
    hosts = load_market_hosts(ROOT / "config" / "market_data_hosts.txt")
    portfolio = load_portfolio(ROOT / "data" / "portfolio.json")
    db = ROOT / "data" / "sqlite.db"
    create_all(db)
    pipe = FinancePipeline(llm, Memory(db), Permissions(db), JsonlLogger(ROOT / "data" / "logs" / "finance_live.jsonl"),
                           ToolMonitor(), ROOT / "data" / "notes", market=HttpMarketData(hosts))
    res = pipe.run(sys.argv[1].upper(), portfolio)
    print(json.dumps({"approved": res.approved, "alert": res.alert.model_dump() if res.alert else None,
                      "reasons": res.reasons}, ensure_ascii=False, indent=2))
    return 0 if res.approved else 1


if __name__ == "__main__":
    sys.exit(main())

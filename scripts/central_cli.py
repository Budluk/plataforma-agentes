import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

from agents.dev.static_check import load_allowed_imports
from agents.research.fetcher import HttpFetcher
from agents.research.urlgate import load_allowed_domains
from agents.finance.market_data import HttpMarketData, load_market_hosts
from agents.finance.portfolio_file import load_portfolio
from core.llm_client import HttpLLMClient, LLMError
from pipelines.central_wiring import build_central
from scripts.init_db import create_all


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) < 2:
        print('uso: central_cli.py "<pedido>"')
        return 1
    load_dotenv(ROOT / ".env")
    try:
        llm = HttpLLMClient("groq")
    except LLMError as exc:
        print("ERRO ao preparar LLM:", exc)
        return 1
    allowed_domains = load_allowed_domains(ROOT / "config" / "allowed_domains.txt")
    allowed_imports = load_allowed_imports(ROOT / "config" / "dev_allowed_imports.txt")
    db = ROOT / "data" / "sqlite.db"
    create_all(db)
    # finanças: preço real (somente leitura) + portfólio de data/portfolio.json (ausente ou antigo = rejeita)
    central = build_central(router_llm=llm, area_llm=llm, db=db, data_dir=ROOT / "data",
                            allowed_domains=allowed_domains, allowed_imports=allowed_imports,
                            fetcher=HttpFetcher(allowed_domains, user_agent=os.getenv("RESEARCH_USER_AGENT") or None),
                            market=HttpMarketData(load_market_hosts(ROOT / "config" / "market_data_hosts.txt")),
                            portfolio_provider=lambda: load_portfolio(ROOT / "data" / "portfolio.json"))
    r = central.handle(sys.argv[1])
    print(json.dumps({"area": r.area, "dispatched": r.dispatched, "ok": r.ok, "data": r.data,
                      "reasons": r.reasons}, ensure_ascii=False, indent=2))
    return 0 if r.ok else 1


if __name__ == "__main__":
    sys.exit(main())



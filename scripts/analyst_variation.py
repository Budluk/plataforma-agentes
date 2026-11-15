import argparse
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

from agents.base_agent import RunContext, ToolBlocked
from agents.finance.analyst import Analyst, ProposalInvalid
from agents.finance.market_data import HttpMarketData, load_market_hosts
from agents.finance.tools import build_tools
from core.contracts import ALLOWED_ASSETS
from core.llm_client import HttpLLMClient, LLMError
from core.logger import JsonlLogger
from core.memory import Memory
from core.permissions import Permissions
from core.tool_monitor import ToolMonitor
from scripts.init_db import create_all


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="Mede se o analista varia com o ativo ou repete um padrão fixo.")
    ap.add_argument("--runs", type=int, default=2)
    ap.add_argument("--assets", nargs="*", default=["BTCUSDT", "EURUSD", "PETR4", "VALE3", "ITUB4"])
    args = ap.parse_args()
    if not 1 <= args.runs <= 5 or not set(args.assets) <= set(ALLOWED_ASSETS):
        print("uso: --runs 1..5 e --assets só entre", sorted(ALLOWED_ASSETS))
        return 1
    load_dotenv(ROOT / ".env")
    try:
        llm = HttpLLMClient("groq")
    except LLMError as exc:
        print("ERRO ao preparar LLM:", exc)
        return 1
    market = HttpMarketData(load_market_hosts(ROOT / "config" / "market_data_hosts.txt"))

    stops, targets, directions, identical = [], [], [], []
    print(f"{len(args.assets) * args.runs} chamadas ao LLM; banco e log temporários (nada é salvo).")
    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        db = tmp / "v.db"
        create_all(db)
        perms, memory, monitor = Permissions(db), Memory(db), ToolMonitor()
        logger = JsonlLogger(tmp / "v.jsonl")
        n = 0
        for asset in args.assets:
            seen = []
            for i in range(args.runs):
                n += 1
                holder = {}
                tools = build_tools(memory, tmp / "notes", {}, market=market, quote_holder=holder)
                analyst = Analyst(llm=llm, tools=tools, monitor=monitor, permissions=perms, logger=logger,
                                  ctx=RunContext(run_id=f"v{n}"))
                try:
                    p = analyst.propose(asset)
                except (ValueError, ProposalInvalid, LLMError, ToolBlocked) as exc:
                    print(f"{asset:8} #{i + 1}  FALHOU: {type(exc).__name__}: {exc}")
                    time.sleep(1.5)
                    continue
                q = holder["quote"]
                dev = (p.entry_price - q.price) / q.price * 100
                stop = abs(p.entry_price - p.stop_price) / p.entry_price * 100
                target = abs(p.target_price - p.entry_price) / p.entry_price * 100
                stops.append(stop)
                targets.append(target)
                directions.append(p.direction)
                seen.append((p.direction, round(stop, 2), round(target, 2)))
                print(f"{asset:8} #{i + 1}  {p.direction:5} entrada {dev:+6.2f}% do mercado | stop {stop:5.2f}% | "
                      f"alvo {target:5.2f}% | R/R {target / stop if stop else 0:4.2f} | confiança {p.confidence:.2f}")
                time.sleep(1.5)
            if len(seen) > 1:
                identical.append((asset, len(set(seen)) == 1))

    if not stops:
        print("Nenhuma proposta obtida.")
        return 1
    print("\n--- resumo ---")
    print(f"propostas: {len(stops)} | LONG: {directions.count('LONG')} | SHORT: {directions.count('SHORT')}")
    print(f"stop %:  mínimo {min(stops):.2f}  máximo {max(stops):.2f}  valores distintos (1 casa): {len({round(s, 1) for s in stops})}")
    print(f"alvo %:  mínimo {min(targets):.2f}  máximo {max(targets):.2f}  valores distintos (1 casa): {len({round(t, 1) for t in targets})}")
    for asset, same in identical:
        print(f"{asset}: repetições {'idênticas' if same else 'DIFERENTES'}")
    if len(stops) >= 4 and len({round(s, 1) for s in stops}) <= 2:
        print("AVISO: o mesmo stop % em ativos de natureza muito diferente sugere um padrão fixo, e não análise.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

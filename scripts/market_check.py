import sys
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from agents.finance.market_data import HttpMarketData, load_market_hosts
from agents.finance.market_parsers import MarketDataError
from core.contracts import ALLOWED_ASSETS


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    hosts = load_market_hosts(ROOT / "config" / "market_data_hosts.txt")
    print("Hosts permitidos:", ", ".join(sorted(hosts)) or "(nenhum)")
    market = HttpMarketData(hosts)
    failed = 0
    for asset in sorted(ALLOWED_ASSETS):
        try:
            q = market.get_quote(asset)
            age = int((datetime.now(timezone.utc) - q.as_of).total_seconds() // 60)
            print(f"{asset:8} {q.price:>14.4f}  {q.source:12} {q.kind:16} idade {age} min")
        except MarketDataError as exc:
            failed += 1
            print(f"{asset:8} FALHOU: {exc}")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())

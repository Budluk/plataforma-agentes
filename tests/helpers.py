from core.contracts import AnalystProposal, PortfolioState


def proposal(**kw) -> AnalystProposal:
    d = dict(asset="PETR4", direction="LONG", entry_price=100.0, stop_price=97.0,
             target_price=108.0, confidence=0.7, thesis="teste")
    d.update(kw)
    return AnalystProposal(**d)


def good_portfolio(**kw) -> PortfolioState:
    d = dict(equity=10000.0, daily_pnl_pct=-0.5, equity_snapshot_consistent=True)
    d.update(kw)
    return PortfolioState(**d)

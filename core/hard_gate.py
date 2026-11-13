from __future__ import annotations
from core.contracts import AnalystProposal, ComputedRisk, PortfolioState, RiskDecision

MAX_DAILY_LOSS_PCT = 2.0
MAX_STOP_DISTANCE_PCT = 5.0
MIN_REWARD_RISK = 1.5

# Veto: nomes de ferramenta que nunca podem existir neste sistema.
FORBIDDEN_TOOL_TOKENS = ("execution_order", "place_order", "submit_order", "send_order", "checkout", "purchase", "payment", "charge_card", "launch_campaign", "set_budget", "send_whatsapp", "publish_page")


class ExecutionToolForbidden(Exception):
    pass


def assert_no_execution_tool(tool_name: str) -> None:
    name = tool_name.lower()
    for token in FORBIDDEN_TOOL_TOKENS:
        if token in name:
            raise ExecutionToolForbidden(f"ferramenta de execução vetada: {tool_name!r}")


def compute_risk(p: AnalystProposal) -> ComputedRisk:
    risk = abs(p.entry_price - p.stop_price)
    reward = abs(p.target_price - p.entry_price)
    if p.direction == "LONG":
        coherent = p.stop_price < p.entry_price < p.target_price
    else:
        coherent = p.target_price < p.entry_price < p.stop_price
    return ComputedRisk(
        stop_distance_pct=risk / p.entry_price * 100,
        reward_risk_ratio=(reward / risk) if risk > 0 else 0.0,
        levels_coherent=coherent,
    )


def evaluate_risk(risk: ComputedRisk, portfolio: PortfolioState) -> RiskDecision:
    reasons: list[str] = []
    if portfolio.equity is None or portfolio.daily_pnl_pct is None:
        reasons.append("dados do portfólio ausentes (falha fechada)")
    else:
        if portfolio.equity <= 0:
            reasons.append("equity não positivo")
        if portfolio.daily_pnl_pct <= -MAX_DAILY_LOSS_PCT:
            reasons.append(f"perda diária {portfolio.daily_pnl_pct}% atingiu o limite de -{MAX_DAILY_LOSS_PCT}%")
    if not portfolio.equity_snapshot_consistent:
        reasons.append("snapshot de equity inconsistente (falha fechada)")
    if not risk.levels_coherent:
        reasons.append("níveis de entrada/stop/alvo incoerentes com a direção")
    if risk.stop_distance_pct > MAX_STOP_DISTANCE_PCT:
        reasons.append(f"stop a {risk.stop_distance_pct:.2f}% excede {MAX_STOP_DISTANCE_PCT}%")
    if risk.reward_risk_ratio < MIN_REWARD_RISK:
        reasons.append(f"relação retorno/risco {risk.reward_risk_ratio:.2f} abaixo de {MIN_REWARD_RISK}")
    return RiskDecision(approved=not reasons, reasons=reasons)



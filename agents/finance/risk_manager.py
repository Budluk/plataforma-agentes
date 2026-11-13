from __future__ import annotations
from pydantic import ValidationError
from agents.base_agent import BaseAgent
from core.contracts import AnalystProposal, ComputedRisk, PortfolioState, RiskDecision
from core.hard_gate import compute_risk, evaluate_risk


class RiskManager(BaseAgent):
    name = "risk_manager"

    def assess(self, proposal: AnalystProposal) -> tuple[ComputedRisk, RiskDecision]:
        raw = self.call_tool("read_portfolio")
        try:
            portfolio = PortfolioState.model_validate(raw)
        except ValidationError:
            portfolio = PortfolioState()  # dados inválidos -> falha fechada no gate
        risk = compute_risk(proposal)
        decision = evaluate_risk(risk, portfolio)
        self.logger.log("risk_decision", run_id=self.ctx.run_id, asset=proposal.asset,
                        approved=decision.approved, reasons=decision.reasons)
        return risk, decision

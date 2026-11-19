from __future__ import annotations
from pydantic import ValidationError
from agents.base_agent import BaseAgent
from core.contracts import AnalystProposal, ComputedRisk, PortfolioState, RiskDecision
from core.hard_gate import compute_risk, evaluate_risk
from core.tool_registry import AGENT_TOOL


class RiskManager(BaseAgent):
    name = "risk_manager"

    def assess(self, proposal: AnalystProposal) -> tuple[ComputedRisk, RiskDecision]:
        raw = self.call_tool(AGENT_TOOL[(self.name, "portfolio")])
        invalid = ""
        try:
            portfolio = PortfolioState.model_validate(raw)
        except ValidationError as exc:
            portfolio = PortfolioState()  # dados inválidos -> falha fechada no gate
            # só nome do campo e tipo do erro: o valor digitado nunca vai para a mensagem
            invalid = ", ".join(".".join(str(x) for x in e["loc"]) + f"({e['type']})" for e in exc.errors())
        risk = compute_risk(proposal)
        decision = evaluate_risk(risk, portfolio)
        if invalid:
            decision = RiskDecision(approved=False,
                                    reasons=[f"portfólio inválido (campos: {invalid})"] + decision.reasons)
        self.logger.log("risk_decision", run_id=self.ctx.run_id, asset=proposal.asset,
                        approved=decision.approved, reasons=decision.reasons)
        return risk, decision

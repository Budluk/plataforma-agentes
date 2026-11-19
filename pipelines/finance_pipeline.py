from __future__ import annotations
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from agents.base_agent import BaseAgent, RunContext, ToolBlocked
from agents.finance.analyst import Analyst, ProposalInvalid
from agents.finance.risk_manager import RiskManager
from agents.finance.tools import build_tools
from core.contracts import AlertEvent
from core.llm_client import LLMError
from core.market import age_seconds, check_entry_vs_market, check_quote
from core.memory import safe_record_run
from core.tool_registry import AGENT_TOOL


class PipelineAgent(BaseAgent):
    name = "pipeline"


@dataclass
class PipelineResult:
    approved: bool
    alert: AlertEvent | None = None
    reasons: list[str] = field(default_factory=list)


class FinancePipeline:
    def __init__(self, llm, memory, permissions, logger, monitor, notes_dir, market=None):
        self.llm, self.memory, self.permissions = llm, memory, permissions
        self.logger, self.monitor, self.notes_dir, self.market = logger, monitor, notes_dir, market

    def _reject(self, ctx: RunContext, asset: str, reasons: list[str]) -> PipelineResult:
        self.logger.log("rejection", run_id=ctx.run_id, asset=asset, reasons=reasons)  # INV-7
        warning = safe_record_run(self.memory, self.logger, "pipeline", asset, "rejected",
                                  "; ".join(reasons), run_id=ctx.run_id)
        out = list(reasons)
        if warning:
            out.append(warning)
        return PipelineResult(approved=False, reasons=out)

    def run(self, asset: str, portfolio: dict) -> PipelineResult:
        ctx = RunContext(run_id=uuid.uuid4().hex[:8])
        holder: dict = {}
        tools = build_tools(self.memory, self.notes_dir, portfolio, market=self.market, quote_holder=holder)
        common = dict(tools=tools, monitor=self.monitor, permissions=self.permissions,
                      logger=self.logger, ctx=ctx)
        analyst = Analyst(llm=self.llm, **common)
        risk_manager = RiskManager(**common)
        emitter = PipelineAgent(**common)
        try:
            proposal = analyst.propose(asset)
            quote = holder.get("quote")
            if quote is None:
                return self._reject(ctx, asset, ["cotação ausente (falha fechada)"])
            now = datetime.now(timezone.utc)
            reasons = check_quote(quote, now) + check_entry_vs_market(proposal, quote)
            if reasons:
                return self._reject(ctx, asset, reasons)
            risk, decision = risk_manager.assess(proposal)
            if not decision.approved:
                return self._reject(ctx, asset, decision.reasons)
            alert = AlertEvent(
                asset=proposal.asset, direction=proposal.direction,
                entry_price=proposal.entry_price, stop_price=proposal.stop_price,
                target_price=proposal.target_price, reward_risk_ratio=risk.reward_risk_ratio,
                message=f"{proposal.direction} {proposal.asset}: R/R {risk.reward_risk_ratio:.2f}",
                data_source=quote.source, data_age_minutes=max(0, int(age_seconds(quote, now) // 60)),
            )
            emitter.call_tool(AGENT_TOOL[(emitter.name, "alert")], alert=alert.model_dump())
        except (ValueError, ProposalInvalid, ToolBlocked, LLMError) as exc:
            return self._reject(ctx, asset, [f"{type(exc).__name__}: {exc}"])
        warning = safe_record_run(self.memory, self.logger, "pipeline", asset,
                                  "alert_emitted", alert.message, run_id=ctx.run_id)
        return PipelineResult(approved=True, alert=alert,
                              reasons=[warning] if warning else [])

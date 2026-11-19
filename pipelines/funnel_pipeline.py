from __future__ import annotations
import json
import re
import uuid
from dataclasses import dataclass, field
from pydantic import ValidationError
from agents.base_agent import RunContext, ToolBlocked
from agents.sales.funnel_agent import FunnelAgent, build_funnel_tools
from agents.sales.funnel_contracts import FunnelRequest
from agents.sales.funnel_gate import check_request
from core.llm_client import LLMError

SYSTEM = ("Converta o relatório em JSON, SOMENTE o objeto, sem texto extra, com as chaves: "
          "product, ad_spend, visitors, checkouts_started, front_sales, bump_sales, upsell_sales, "
          "front_price, bump_price, upsell_price, platform_fee_pct, tax_pct, variable_cost_per_order. "
          "Use apenas números presentes no relatório. Se um número obrigatório não aparecer, "
          "OMITA a chave; nunca invente nem estime valores.")
_FENCE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL)


class FunnelRequestInvalid(Exception):
    pass


def parse_request(raw: str) -> FunnelRequest:
    text = raw.strip()
    m = _FENCE.match(text)
    if m:
        text = m.group(1)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        raise FunnelRequestInvalid("resposta do LLM não é JSON válido") from None
    if not isinstance(data, dict):
        raise FunnelRequestInvalid("JSON do LLM não é um objeto")
    try:
        return FunnelRequest.model_validate(data)
    except ValidationError as exc:
        raise FunnelRequestInvalid(f"relatório falhou na validação ({exc.error_count()} erro(s))") from None


@dataclass
class FunnelResult:
    ok: bool
    data: dict | None = None
    reasons: list[str] = field(default_factory=list)


class FunnelPipeline:
    def __init__(self, llm, memory, permissions, logger, monitor):
        self.llm, self.memory, self.permissions = llm, memory, permissions
        self.logger, self.monitor = logger, monitor

    def _reject(self, ctx: RunContext, reasons: list[str]) -> FunnelResult:
        self.logger.log("rejection", run_id=ctx.run_id, agent="funnel_agent", reasons=reasons)
        self.memory.record_run("funnel_agent", None, "rejected", "; ".join(reasons))
        return FunnelResult(ok=False, reasons=reasons)

    def run(self, text: str) -> FunnelResult:
        ctx = RunContext(run_id=uuid.uuid4().hex[:8])
        try:
            self.logger.log("llm_request", run_id=ctx.run_id, agent="funnel_agent")
            raw = self.llm.complete(SYSTEM, text)
            self.logger.log("llm_response", run_id=ctx.run_id, agent="funnel_agent", chars=len(raw))
            req = parse_request(raw)
        except (FunnelRequestInvalid, LLMError) as exc:
            return self._reject(ctx, [f"{type(exc).__name__}: {exc}"])
        return self._execute(ctx, req)

    def run_request(self, req: FunnelRequest) -> FunnelResult:
        return self._execute(RunContext(run_id=uuid.uuid4().hex[:8]), req)

    def _execute(self, ctx: RunContext, req: FunnelRequest) -> FunnelResult:
        reasons = check_request(req)
        if reasons:
            return self._reject(ctx, reasons)
        agent = FunnelAgent(tools=build_funnel_tools(), monitor=self.monitor,
                            permissions=self.permissions, logger=self.logger, ctx=ctx)
        try:
            data = agent.execute(req)
        except (ValueError, ToolBlocked) as exc:
            return self._reject(ctx, [f"{type(exc).__name__}: {exc}"])
        self.memory.record_run("funnel_agent", None, "ok", f"funnel:{data['decision']}")
        return FunnelResult(ok=True, data=data)

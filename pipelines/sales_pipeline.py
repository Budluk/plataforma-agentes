from __future__ import annotations
import json
import re
import uuid
from dataclasses import dataclass, field
from pydantic import ValidationError
from agents.base_agent import RunContext, ToolBlocked
from agents.sales.agent import SalesAgent
from agents.sales.contracts import MAX_TARGET_MARGIN_PCT, SalesRequest
from agents.sales.gate import check_request
from agents.sales.tools import build_sales_tools
from core.llm_client import LLMError

SYSTEM = ("Converta o pedido em JSON, SOMENTE o objeto, sem texto extra, com as chaves: "
          "action (margin, price ou break_even), product (texto curto), unit_cost (número), "
          f"price (número, em margin e break_even), target_margin_pct (número de 0 a menos de "
          f"{MAX_TARGET_MARGIN_PCT}, em price), "
          "fixed_costs (número, em break_even) e competitor_prices (lista de números, opcional). "
          "Inclua apenas números que estejam no pedido; não invente valores.")
_FENCE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL)


class SalesRequestInvalid(Exception):
    pass


def parse_request(raw: str) -> SalesRequest:
    text = raw.strip()
    m = _FENCE.match(text)
    if m:
        text = m.group(1)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        raise SalesRequestInvalid("resposta do LLM não é JSON válido") from None
    if not isinstance(data, dict):
        raise SalesRequestInvalid("JSON do LLM não é um objeto")
    try:
        return SalesRequest.model_validate(data)
    except ValidationError as exc:
        raise SalesRequestInvalid(f"pedido falhou na validação ({exc.error_count()} erro(s))") from None


@dataclass
class SalesPipelineResult:
    ok: bool
    data: dict | None = None
    reasons: list[str] = field(default_factory=list)


class SalesPipeline:
    def __init__(self, llm, memory, permissions, logger, monitor):
        self.llm, self.memory, self.permissions = llm, memory, permissions
        self.logger, self.monitor = logger, monitor

    def _reject(self, ctx: RunContext, reasons: list[str]) -> SalesPipelineResult:
        self.logger.log("rejection", run_id=ctx.run_id, agent="sales_agent", reasons=reasons)
        self.memory.record_run("sales_agent", None, "rejected", "; ".join(reasons))
        return SalesPipelineResult(ok=False, reasons=reasons)

    def run(self, text: str) -> SalesPipelineResult:
        ctx = RunContext(run_id=uuid.uuid4().hex[:8])
        try:
            self.logger.log("llm_request", run_id=ctx.run_id, agent="sales_agent")
            raw = self.llm.complete(SYSTEM, text)
            self.logger.log("llm_response", run_id=ctx.run_id, agent="sales_agent", chars=len(raw))
            req = parse_request(raw)
        except (SalesRequestInvalid, LLMError) as exc:
            return self._reject(ctx, [f"{type(exc).__name__}: {exc}"])
        return self._execute(ctx, req)

    def run_request(self, req: SalesRequest) -> SalesPipelineResult:
        return self._execute(RunContext(run_id=uuid.uuid4().hex[:8]), req)

    def _execute(self, ctx: RunContext, req: SalesRequest) -> SalesPipelineResult:
        reasons = check_request(req)
        if reasons:
            return self._reject(ctx, reasons)
        agent = SalesAgent(tools=build_sales_tools(), monitor=self.monitor,
                           permissions=self.permissions, logger=self.logger, ctx=ctx)
        try:
            data = agent.execute(req)
        except (ValueError, ToolBlocked) as exc:
            return self._reject(ctx, [f"{type(exc).__name__}: {exc}"])
        self.memory.record_run("sales_agent", None, "ok", req.action)
        return SalesPipelineResult(ok=True, data=data)

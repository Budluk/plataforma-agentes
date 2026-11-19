from __future__ import annotations
import json
import re
from pydantic import ValidationError
from agents.base_agent import BaseAgent
from core.contracts import ALLOWED_ASSETS, AnalystProposal
from core.tool_registry import AGENT_TOOL

SYSTEM = ("Você é um analista de mercado. Responda SOMENTE com um objeto JSON, sem texto extra, "
          "com as chaves: asset, direction (LONG ou SHORT), entry_price, stop_price, "
          "target_price, confidence (0 a 1), thesis (texto curto).")

_FENCE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL)


class ProposalInvalid(Exception):
    pass


def parse_proposal(raw: str) -> AnalystProposal:
    text = raw.strip()
    m = _FENCE.match(text)
    if m:
        text = m.group(1)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        raise ProposalInvalid("resposta do LLM não é JSON válido") from None
    if not isinstance(data, dict):
        raise ProposalInvalid("JSON do LLM não é um objeto")
    try:
        return AnalystProposal.model_validate(data)
    except ValidationError as exc:
        raise ProposalInvalid(f"proposta falhou na validação ({exc.error_count()} erro(s))") from None


class Analyst(BaseAgent):
    name = "analyst"

    def __init__(self, llm, **kwargs):
        super().__init__(**kwargs)
        self.llm = llm

    def propose(self, asset: str) -> AnalystProposal:
        if asset not in ALLOWED_ASSETS:
            raise ValueError(f"ativo fora da lista permitida: {asset!r}")
        data = self.call_tool(AGENT_TOOL[(self.name, "market_data")], asset=asset)
        self.logger.log("llm_request", run_id=self.ctx.run_id, agent=self.name, asset=asset)
        raw = self.llm.complete(SYSTEM, f"Ativo: {asset}. Dados de mercado: {json.dumps(data)}")
        self.logger.log("llm_response", run_id=self.ctx.run_id, agent=self.name,
                        asset=asset, chars=len(raw))
        proposal = parse_proposal(raw)
        if proposal.asset != asset:
            raise ProposalInvalid("ativo da proposta difere do solicitado")
        return proposal

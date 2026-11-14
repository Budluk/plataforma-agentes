from __future__ import annotations
import json
import re
import uuid
from dataclasses import dataclass, field
from pydantic import ValidationError
from agents.base_agent import RunContext, ToolBlocked
from agents.dev.agent import DevAgent
from agents.dev.contracts import DevProposal, DevRequest
from agents.dev.gate import check_request
from agents.dev.tools import build_dev_tools
from core.llm_client import LLMError

_FENCE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL)


class DevProposalInvalid(Exception):
    pass


def build_system(allowed_imports) -> str:
    modules = ", ".join(sorted(allowed_imports)) or "nenhum"
    return ("Você escreve código Python. Responda SOMENTE com um objeto JSON com as chaves: "
            "filename (apenas letras, números, _ ou -, terminando em .py), code (o código completo) "
            "e explanation (até 600 caracteres, em português). Regras do código: importe apenas "
            f"estes módulos: {modules}; não leia nem escreva arquivos, não use rede, não use eval, "
            "exec, getattr, open nem atributos com dois sublinhados; no máximo 150 linhas; inclua "
            "docstrings curtas e type hints. O código NÃO será executado pela plataforma: "
            "uma pessoa vai revisá-lo.")


def parse_proposal(raw: str) -> DevProposal:
    text = raw.strip()
    m = _FENCE.match(text)
    if m:
        text = m.group(1)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        raise DevProposalInvalid("resposta do LLM não é JSON válido") from None
    if not isinstance(data, dict):
        raise DevProposalInvalid("JSON do LLM não é um objeto")
    try:
        return DevProposal.model_validate(data)
    except ValidationError as exc:
        raise DevProposalInvalid(f"proposta falhou na validação ({exc.error_count()} erro(s))") from None


@dataclass
class DevResult:
    ok: bool
    data: dict | None = None
    reasons: list[str] = field(default_factory=list)


class DevPipeline:
    """O código é texto: analisado e, se aprovado, salvo em arquivo. Nunca é executado."""

    def __init__(self, llm, allowed_imports, out_dir, memory, permissions, logger, monitor):
        self.llm, self.allowed_imports, self.out_dir = llm, allowed_imports, out_dir
        self.memory, self.permissions, self.logger, self.monitor = memory, permissions, logger, monitor

    def _reject(self, ctx: RunContext, reasons: list[str]) -> DevResult:
        self.logger.log("rejection", run_id=ctx.run_id, agent="dev_agent", reasons=reasons)
        self.memory.record_run("dev_agent", None, "rejected", "; ".join(reasons)[:500])
        return DevResult(ok=False, reasons=reasons)

    def _agent(self, ctx: RunContext, holder: dict) -> DevAgent:
        tools = build_dev_tools(holder, self.allowed_imports, self.out_dir)
        return DevAgent(tools=tools, monitor=self.monitor, permissions=self.permissions,
                        logger=self.logger, ctx=ctx)

    def write(self, task: str) -> DevResult:
        ctx = RunContext(run_id=uuid.uuid4().hex[:8])
        try:
            req = DevRequest(action="write", task=task)
        except ValidationError:
            return self._reject(ctx, ["pedido inválido (tarefa fora do formato)"])
        reasons = check_request(req)
        if reasons:
            return self._reject(ctx, reasons)
        try:
            self.logger.log("llm_request", run_id=ctx.run_id, agent="dev_agent")
            raw = self.llm.complete(build_system(self.allowed_imports), req.task)
            self.logger.log("llm_response", run_id=ctx.run_id, agent="dev_agent", chars=len(raw))
            proposal = parse_proposal(raw)
        except (DevProposalInvalid, LLMError) as exc:
            return self._reject(ctx, [f"{type(exc).__name__}: {exc}"])

        agent = self._agent(ctx, {"code": proposal.code, "approved": False})
        try:
            report = agent.analyze()
            if not report["approved"]:
                return self._reject(ctx, ["análise estática reprovou o código"] + report["findings"])
            saved = agent.save(proposal.filename)
        except (ValueError, ToolBlocked) as exc:
            return self._reject(ctx, [f"{type(exc).__name__}: {exc}"])

        self.memory.record_run("dev_agent", None, "ok", saved["filename"])
        return DevResult(ok=True, data={
            "filename": saved["filename"], "path": saved["path"], "executed": False,
            "explanation": proposal.explanation, "warnings": report["warnings"],
            "metrics": report["metrics"],
        })

    def review(self, code: str) -> DevResult:
        ctx = RunContext(run_id=uuid.uuid4().hex[:8])
        try:
            req = DevRequest(action="review", code=code)
        except ValidationError:
            return self._reject(ctx, ["pedido inválido (código acima do limite)"])
        reasons = check_request(req)
        if reasons:
            return self._reject(ctx, reasons)
        agent = self._agent(ctx, {"code": req.code, "approved": False})
        try:
            report = agent.analyze()
        except (ValueError, ToolBlocked) as exc:
            return self._reject(ctx, [f"{type(exc).__name__}: {exc}"])
        self.memory.record_run("dev_agent", None, "ok", f"review:{'aprovado' if report['approved'] else 'reprovado'}")
        return DevResult(ok=True, data={"approved": report["approved"], "findings": report["findings"],
                                        "warnings": report["warnings"], "metrics": report["metrics"],
                                        "executed": False})

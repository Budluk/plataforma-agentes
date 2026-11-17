from __future__ import annotations
import re
import uuid
from dataclasses import dataclass, field
from pydantic import ValidationError
from agents.base_agent import RunContext, ToolBlocked
from agents.studio.agent import StudioAgent
from agents.studio.client import StudioError
from agents.studio.contracts import StudioRequest
from agents.studio.gate import check_request
from agents.studio.tools import build_studio_tools

_UUID = re.compile(r"\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b", re.IGNORECASE)
_LIST = re.compile(r"^\s*(listar|lista|list|meus apps|meus aplicativos)\b", re.IGNORECASE)
_VALIDATE = re.compile(r"\b(validar|valide|valida\u00e7\u00e3o|verificar|verifique)\b", re.IGNORECASE)
_HEALTH = re.compile(r"^\s*(status|sa\u00fade|health|ping)\s*[.!?]?\s*$", re.IGNORECASE)


def new_context() -> RunContext:
    return RunContext(run_id=uuid.uuid4().hex[:8])


@dataclass
class StudioResult:
    ok: bool
    data: dict | None = None
    reasons: list[str] = field(default_factory=list)


class StudioPipeline:
    """Área mais supervisionada da plataforma.

    Toda ação passa por: contrato Pydantic fechado -> gate determinístico ->
    BaseAgent.call_tool (monitor de 5 cabeças + permissões + log JSONL).
    O pipeline não executa código gerado: apenas fala com o serviço local.
    """

    def __init__(self, client, memory, permissions, logger, monitor):
        self.client, self.memory = client, memory
        self.permissions, self.logger, self.monitor = permissions, logger, monitor

    def _reject(self, ctx: RunContext, reasons: list[str]) -> StudioResult:
        self.logger.log("rejection", run_id=ctx.run_id, agent="studio_agent", reasons=reasons)
        self.memory.record_run("studio_agent", None, "rejected", "; ".join(reasons)[:500])
        return StudioResult(ok=False, reasons=reasons)

    def _ok(self, ctx: RunContext, data: dict) -> StudioResult:
        self.logger.log("studio_result", run_id=ctx.run_id, agent="studio_agent", ok=True)
        detail = str(data.get("id") or data.get("count") or data.get("status") or "")[:500]
        self.memory.record_run("studio_agent", None, "ok", detail)
        return StudioResult(ok=True, data=data)

    def _agent(self, ctx: RunContext) -> StudioAgent:
        return StudioAgent(tools=build_studio_tools(self.client), monitor=self.monitor,
                           permissions=self.permissions, logger=self.logger, ctx=ctx)

    def _execute(self, ctx: RunContext, action: str, *, prompt: str | None = None,
                 project_id: str | None = None) -> StudioResult:
        try:
            req = StudioRequest(action=action, prompt=prompt, project_id=project_id)
        except ValidationError:
            return self._reject(ctx, ["pedido inválido (ação, descrição ou project_id fora do formato)"])
        reasons = check_request(req)
        if reasons:
            return self._reject(ctx, reasons)

        agent = self._agent(ctx)
        try:
            if req.action == "health":
                return self._ok(ctx, agent.health())
            agent.health()  # sonda obrigatória antes de qualquer outra ação
            if req.action == "list":
                return self._ok(ctx, agent.list_apps())
            if req.action == "create":
                return self._ok(ctx, agent.create_app(prompt=req.prompt))
            if req.action == "status":
                return self._ok(ctx, agent.app_status(project_id=req.project_id))
            return self._ok(ctx, agent.validate_app(project_id=req.project_id))
        except (ToolBlocked, StudioError, ValueError) as exc:
            return self._reject(ctx, [f"{type(exc).__name__}: {exc}"])

    # --- API explícita (CLI) ---------------------------------------------
    def health(self) -> StudioResult:
        return self._execute(new_context(), "health")

    def list_apps(self) -> StudioResult:
        return self._execute(new_context(), "list")

    def create(self, prompt: str) -> StudioResult:
        return self._execute(new_context(), "create", prompt=prompt)

    def status(self, project_id: str) -> StudioResult:
        return self._execute(new_context(), "status", project_id=project_id)

    def validate(self, project_id: str) -> StudioResult:
        return self._execute(new_context(), "validate", project_id=project_id)

    # --- entrada do agente central (texto livre) --------------------------
    def run(self, text: str) -> StudioResult:
        ctx = new_context()
        cleaned = (text or "").strip()
        if not cleaned:
            return self._reject(ctx, ["pedido vazio"])
        match = _UUID.search(cleaned)
        if match:
            action = "validate" if _VALIDATE.search(cleaned) else "status"
            return self._execute(ctx, action, project_id=match.group(0).lower())
        if _LIST.search(cleaned):
            return self._execute(ctx, "list")
        if _HEALTH.match(cleaned):
            return self._execute(ctx, "health")
        return self._execute(ctx, "create", prompt=cleaned)

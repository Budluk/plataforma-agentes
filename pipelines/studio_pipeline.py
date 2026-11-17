from __future__ import annotations
import re
import uuid
from dataclasses import dataclass, field
from urllib.parse import urlsplit
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
_IMPORT = re.compile(r"^\s*(importar|importe|import)\b\s*(.*)$", re.IGNORECASE | re.DOTALL)
_MESSAGE = re.compile(
    r"^\s*(?:mensagem|alterar|altere|mudar|mude|ajustar|ajuste)\s+(\S+)\s*[:\-]?\s*(.+)$",
    re.IGNORECASE | re.DOTALL,
)
_FIX_VALIDATION = re.compile(
    r"(fix[-\s]?validation|corrigir\s+(?:a\s+)?valida\u00e7\u00e3o|corrigir\s+o\s+preview)",
    re.IGNORECASE,
)
_REBUILD = re.compile(r"\b(recompilar|recompile|rebuild)\b", re.IGNORECASE)
_RETRY = re.compile(r"\b(retry|tentar\s+de\s+novo|tentar\s+novamente|repetir)\b", re.IGNORECASE)
_FIX = re.compile(r"\b(corrigir|corrija|fix)\b", re.IGNORECASE)
_URL_IN_TEXT = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)
_GITHUB_HOSTS = frozenset({"github.com", "www.github.com"})


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
                 project_id: str | None = None, message: str | None = None,
                 url: str | None = None, kind: str | None = None) -> StudioResult:
        try:
            req = StudioRequest(action=action, prompt=prompt, project_id=project_id,
                                message=message, url=url, kind=kind)
        except ValidationError:
            return self._reject(ctx, ["pedido inválido (ação ou parâmetro fora do formato)"])
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
            if req.action == "validate":
                return self._ok(ctx, agent.validate_app(project_id=req.project_id))
            if req.action == "messages":
                return self._ok(ctx, agent.send_message(project_id=req.project_id,
                                                        content=req.message))
            if req.action == "fix":
                return self._ok(ctx, agent.fix_app(project_id=req.project_id))
            if req.action == "fix_validation":
                return self._ok(ctx, agent.fix_validation(project_id=req.project_id))
            if req.action == "rebuild":
                return self._ok(ctx, agent.rebuild_app(project_id=req.project_id))
            if req.action == "retry":
                return self._ok(ctx, agent.retry_app(project_id=req.project_id))
            # import
            if req.kind == "app":
                return self._ok(ctx, agent.import_app(project_id=req.project_id))
            if req.kind == "github":
                return self._ok(ctx, agent.import_github(url=req.url))
            return self._ok(ctx, agent.import_site(url=req.url, prompt=req.prompt))
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

    def message(self, project_id: str, content: str) -> StudioResult:
        return self._execute(new_context(), "messages", project_id=project_id, message=content)

    def fix(self, project_id: str) -> StudioResult:
        return self._execute(new_context(), "fix", project_id=project_id)

    def fix_validation(self, project_id: str) -> StudioResult:
        return self._execute(new_context(), "fix_validation", project_id=project_id)

    def rebuild(self, project_id: str) -> StudioResult:
        return self._execute(new_context(), "rebuild", project_id=project_id)

    def retry(self, project_id: str) -> StudioResult:
        return self._execute(new_context(), "retry", project_id=project_id)

    def import_site(self, url: str, prompt: str | None = None) -> StudioResult:
        return self._execute(new_context(), "import", url=url, kind="site", prompt=prompt)

    def import_github(self, url: str) -> StudioResult:
        return self._execute(new_context(), "import", url=url, kind="github")

    def import_app(self, project_id: str) -> StudioResult:
        return self._execute(new_context(), "import", project_id=project_id, kind="app")

    # --- entrada do agente central (texto livre) --------------------------
    def run(self, text: str) -> StudioResult:
        ctx = new_context()
        cleaned = (text or "").strip()
        if not cleaned:
            return self._reject(ctx, ["pedido vazio"])

        match = _MESSAGE.match(cleaned)
        if match and _UUID.fullmatch(match.group(1)):
            return self._execute(ctx, "messages", project_id=match.group(1).lower(),
                                 message=match.group(2).strip())

        match = _IMPORT.match(cleaned)
        if match:
            url_match = _URL_IN_TEXT.search(match.group(2))
            if not url_match:
                return self._reject(ctx, ["importação exige uma URL"])
            url = url_match.group(0).rstrip(".,;:!?)]}\"'")
            host = (urlsplit(url).hostname or "").lower()
            kind = "github" if host in _GITHUB_HOSTS else "site"
            return self._execute(ctx, "import", url=url, kind=kind)

        match = _UUID.search(cleaned)
        if match:
            project_id = match.group(0).lower()
            if _FIX_VALIDATION.search(cleaned):
                action = "fix_validation"
            elif _REBUILD.search(cleaned):
                action = "rebuild"
            elif _RETRY.search(cleaned):
                action = "retry"
            elif _VALIDATE.search(cleaned):
                action = "validate"
            elif _FIX.search(cleaned):
                action = "fix"
            else:
                action = "status"
            return self._execute(ctx, action, project_id=project_id)

        if _LIST.search(cleaned):
            return self._execute(ctx, "list")
        if _HEALTH.match(cleaned):
            return self._execute(ctx, "health")
        return self._execute(ctx, "create", prompt=cleaned)

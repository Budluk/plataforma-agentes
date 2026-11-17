from __future__ import annotations
import re
from dataclasses import dataclass
from typing import Any, Callable
from core.control_store import ControlStore, params_hash

_NAME = re.compile(r"^[a-z][a-z0-9_.]{2,40}$")


class ActionRefused(Exception):
    def __init__(self, code: str, message: str):
        super().__init__(f"{code}: {message}")
        self.code, self.message = code, message


class ActionFailed(Exception):
    pass


@dataclass(frozen=True)
class Limits:
    max_proposals: int
    max_executions: int
    window_seconds: int

    def __post_init__(self):
        if min(self.max_proposals, self.max_executions, self.window_seconds) < 1:
            raise ValueError("limites devem ser positivos")


@dataclass(frozen=True)
class ActionSpec:
    name: str
    schema: Any
    limits: Limits
    approval_ttl_seconds: int = 600
    description: str = ""

    def __post_init__(self):
        if not _NAME.match(self.name):
            raise ValueError(f"nome de ação inválido: {self.name!r}")
        if not hasattr(self.schema, "model_validate"):
            raise ValueError("schema precisa ter model_validate (use um modelo Pydantic)")
        if not 30 <= self.approval_ttl_seconds <= 86400:
            raise ValueError("validade da aprovação deve ficar entre 30 s e 24 h")


@dataclass(frozen=True)
class Proposal:
    approval_id: int
    action: str
    params: dict
    expires_ts: float


@dataclass(frozen=True)
class ExecutionResult:
    approval_id: int
    action: str
    result: dict


def _fields(exc: Exception) -> list[str]:
    try:
        return [".".join(str(p) for p in e["loc"]) + f"({e['type']})" for e in exc.errors()]
    except Exception:
        return [type(exc).__name__]


def _dump(schema, params) -> dict:
    return schema.model_validate(params).model_dump(mode="json")


class ActionGateway:
    """Porta ÚNICA das ações sensíveis. Quem propõe (o agente ou o LLM) nunca executa:
    propor cria um pedido pendente; só uma pessoa aprova (scripts/approvals.py); a execução exige
    aprovação válida, de uso único, parâmetros idênticos aos aprovados, kill switch desligado e limite de frequência."""

    def __init__(self, store: ControlStore, specs: dict[str, ActionSpec], handlers: dict[str, Callable[[dict], dict]]):
        if set(specs) != set(handlers):
            raise ValueError("specs e handlers precisam cobrir exatamente as mesmas ações")
        for name, spec in specs.items():
            if spec.name != name:
                raise ValueError("chave do dicionário diferente do nome da ação")
        self._store, self._specs, self._handlers = store, dict(specs), dict(handlers)

    def _refuse(self, run_id: str, actor: str, action, code: str, message: str, **detail):
        self._store.append_audit(run_id, actor, "refused", str(action)[:40], code, {"message": message, **detail})
        raise ActionRefused(code, message)

    def _check_kill(self, run_id: str, actor: str, action) -> None:
        engaged, why = self._store.kill_state()
        if engaged:
            self._refuse(run_id, actor, action, "kill_switch", why or "kill switch ativo")

    def propose(self, action: str, params: dict, actor: str, run_id: str) -> Proposal:
        self._check_kill(run_id, actor, action)
        spec = self._specs.get(action) if isinstance(action, str) else None
        if spec is None:
            self._refuse(run_id, actor, action, "unknown_action", "ação desconhecida")
        try:
            validated = _dump(spec.schema, params)
        except ValueError as exc:
            self._refuse(run_id, actor, action, "invalid_params", "parâmetros inválidos", fields=_fields(exc))
        if not self._store.try_record_call(action, "proposal", spec.limits.max_proposals, spec.limits.window_seconds):
            self._refuse(run_id, actor, action, "rate_limited", "limite de propostas atingido")
        approval_id = self._store.create_approval(action, validated, actor, run_id, spec.approval_ttl_seconds)
        row = self._store.get_approval(approval_id)
        self._store.append_audit(run_id, actor, "proposed", action, "pending",
                                 {"approval_id": approval_id, "params": validated})
        return Proposal(approval_id, action, validated, row["expires_ts"])

    def execute(self, approval_id: int, actor: str, run_id: str) -> ExecutionResult:
        self._check_kill(run_id, actor, "")
        row = self._store.get_approval(approval_id)
        if row is None:
            self._refuse(run_id, actor, "", "not_found", "pedido de aprovação inexistente", approval_id=approval_id)
        action = row["action"]
        spec = self._specs.get(action)
        if spec is None:
            self._refuse(run_id, actor, action, "unknown_action", "ação desconhecida", approval_id=approval_id)
        try:
            params = _dump(spec.schema, row["params"])
        except ValueError:
            self._refuse(run_id, actor, action, "tampered", "parâmetros guardados não passam mais na validação",
                         approval_id=approval_id)
        if params_hash(params) != row["params_hash"]:
            self._refuse(run_id, actor, action, "tampered", "parâmetros diferentes dos aprovados", approval_id=approval_id)
        if row["status"] != "approved" or row["expires_ts"] <= self._store.clock():
            self._refuse(run_id, actor, action, "not_approved",
                         f"pedido não está aprovado e válido (estado: {row['status']})", approval_id=approval_id)
        if not self._store.try_record_call(action, "execution", spec.limits.max_executions, spec.limits.window_seconds):
            self._refuse(run_id, actor, action, "rate_limited", "limite de execuções atingido", approval_id=approval_id)
        if not self._store.consume(approval_id):
            self._refuse(run_id, actor, action, "not_approved", "aprovação já usada ou vencida", approval_id=approval_id)
        self._store.append_audit(run_id, actor, "executing", action, "started", {"approval_id": approval_id})
        engaged, why = self._store.kill_state()
        if engaged:
            self._store.finish(approval_id, False, {"error": "kill_switch"})
            self._refuse(run_id, actor, action, "kill_switch", why or "kill switch ativo", approval_id=approval_id)
        try:
            result = self._handlers[action](params)
            if not isinstance(result, dict):
                result = {"value": result}
        except Exception as exc:
            self._store.finish(approval_id, False, {"error": type(exc).__name__})
            self._store.append_audit(run_id, actor, "executed", action, "failed",
                                     {"approval_id": approval_id, "error": type(exc).__name__})
            raise ActionFailed(f"{action} falhou: {type(exc).__name__}") from None
        self._store.finish(approval_id, True, result)
        self._store.append_audit(run_id, actor, "executed", action, "ok", {"approval_id": approval_id, "result": result})
        return ExecutionResult(approval_id, action, result)

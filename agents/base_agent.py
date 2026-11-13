from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any, Callable, final
from pydantic import ValidationError
from core.contracts import ToolCall
from core.logger import JsonlLogger
from core.permissions import Permissions
from core.tool_monitor import ToolMonitor


class ToolBlocked(Exception):
    def __init__(self, tool: str, head: str, reason: str):
        super().__init__(f"ferramenta {tool!r} bloqueada [{head}]: {reason}")
        self.tool, self.head, self.reason = tool, head, reason


@dataclass
class RunContext:
    run_id: str
    history: list[str] = field(default_factory=list)


class BaseAgent:
    name = "base"

    def __init_subclass__(cls, **kwargs):
        super().__init_subclass__(**kwargs)
        if "call_tool" in cls.__dict__:
            raise TypeError("call_tool é final e não pode ser sobrescrito")

    def __init__(self, tools: dict[str, Callable[..., Any]], monitor: ToolMonitor,
                 permissions: Permissions, logger: JsonlLogger, ctx: RunContext):
        self.tools, self.monitor, self.permissions = tools, monitor, permissions
        self.logger, self.ctx = logger, ctx

    def _block(self, tool: str, head: str, reason: str):
        self.logger.log("tool_blocked", run_id=self.ctx.run_id, agent=self.name,
                        tool=tool, head=head, reason=reason)
        raise ToolBlocked(tool, head, reason)

    @final
    def call_tool(self, tool: str, **params):
        # INV-6: loga antes de qualquer verificação ou execução
        self.logger.log("tool_call_attempt", run_id=self.ctx.run_id, agent=self.name,
                        tool=tool, params=params)
        try:
            call = ToolCall(agent=self.name, tool=tool, params=params)
        except ValidationError:
            self._block(tool, "contract", "chamada inválida")
        verdict = self.monitor.check(call, self.ctx.history)
        if not verdict.allowed:
            self._block(tool, verdict.head, verdict.reason)
        if not self.permissions.is_allowed(self.name, tool):
            self._block(tool, "permissions", f"agente {self.name!r} sem permissão")
        fn = self.tools.get(tool)
        if fn is None:
            self._block(tool, "registry", "ferramenta não implementada")
        self.ctx.history.append(tool)
        result = fn(**params)
        self.logger.log("tool_ok", run_id=self.ctx.run_id, agent=self.name, tool=tool)
        return result

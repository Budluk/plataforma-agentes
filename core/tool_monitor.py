from __future__ import annotations
import re
import unicodedata
from urllib.parse import unquote
from core.contracts import MonitorVerdict, ToolCall
from core.hard_gate import ExecutionToolForbidden, assert_no_execution_tool
from core.tool_registry import KNOWN_TOOLS, REGISTRY, STUDIO_TOOLS  # noqa: F401

# Só campos que podem virar caminho de arquivo recebem validação de conteúdo.
# Texto livre (prompt, nota, mensagem) vai para LLM/arquivo de dados, nunca para shell.
PATH_KEYS = frozenset({"filename", "filepath", "path", "dir", "directory"})
SAFE_PATH = re.compile(r"[A-Za-z0-9][A-Za-z0-9_. -]{0,119}\Z")
MAX_STR_LEN = 5000
MAX_DEPTH = 5


def _scan(value, depth: int = 0, key: str | None = None) -> str | None:
    if depth > MAX_DEPTH:
        return "parâmetros aninhados demais"
    if value is None or isinstance(value, (bool, int, float)):
        return None
    if isinstance(value, str):
        if len(value) > MAX_STR_LEN:
            return "string de parâmetro longa demais"
        if key in PATH_KEYS:
            # NFKC + unquote evitam traversal por caracteres Unicode ou %-encoding.
            normalized = unquote(unicodedata.normalize("NFKC", value))
            if not SAFE_PATH.fullmatch(normalized):
                return f"caminho de parâmetro inválido: {key!r}"
        return None
    if isinstance(value, (list, tuple)):
        for item in value:
            reason = _scan(item, depth + 1)
            if reason:
                return reason
        return None
    if isinstance(value, dict):
        for k, item in value.items():
            if not isinstance(k, str):
                return "chave de parâmetro não é string"
            reason = _scan(k, depth + 1) or _scan(item, depth + 1, key=k)
            if reason:
                return reason
        return None
    return f"tipo de parâmetro não permitido: {type(value).__name__}"


class ToolMonitor:
    """5 cabeças em cascata. Qualquer bloqueio ou falha interna bloqueia (INV-4)."""

    def __init__(self, max_calls: int = 20):
        self.max_calls = max_calls
        self.heads = [
            ("veto", self._veto),
            ("registry", self._registry),
            ("params", self._params),
            ("sequence", self._sequence),
            ("rate", self._rate),
        ]

    def _veto(self, call: ToolCall, history: list[str]) -> str | None:
        try:
            assert_no_execution_tool(call.tool)
        except ExecutionToolForbidden as exc:
            return str(exc)
        return None

    def _registry(self, call: ToolCall, history: list[str]) -> str | None:
        if call.tool not in KNOWN_TOOLS:
            return f"ferramenta desconhecida: {call.tool!r}"
        return None

    def _params(self, call: ToolCall, history: list[str]) -> str | None:
        return _scan(call.params)

    def _sequence(self, call: ToolCall, history: list[str]) -> str | None:
        spec = REGISTRY.get(call.tool)
        if spec is not None:
            for needed in spec.requires:
                if needed not in history:
                    return f"{call.tool} exige {needed} antes na mesma execução"
        if history[-2:] == [call.tool, call.tool]:
            return f"loop detectado: {call.tool!r} chamada 3 vezes seguidas"
        return None

    def _rate(self, call: ToolCall, history: list[str]) -> str | None:
        if len(history) >= self.max_calls:
            return f"limite de {self.max_calls} chamadas por execução atingido"
        return None

    def check(self, call: ToolCall, history: list[str]) -> MonitorVerdict:
        for name, head in self.heads:
            try:
                reason = head(call, history)
            except Exception as exc:
                return MonitorVerdict(allowed=False, head=name,
                                      reason=f"cabeça falhou ({type(exc).__name__}); bloqueado por padrão")
            if reason:
                return MonitorVerdict(allowed=False, head=name, reason=reason)
        return MonitorVerdict(allowed=True, head="cascade", reason="todas as cabeças aprovaram")






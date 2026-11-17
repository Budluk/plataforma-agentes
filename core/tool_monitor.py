from __future__ import annotations
from core.contracts import MonitorVerdict, ToolCall
from core.hard_gate import ExecutionToolForbidden, assert_no_execution_tool

KNOWN_TOOLS = frozenset({"get_market_data", "read_portfolio", "write_research_note", "emit_alert", "identify_chord", "transpose_notes", "to_guitar_tab", "compute_margin", "suggest_price", "break_even", "analyze_funnel", "fetch_page", "analyze_code", "save_code_file", "studio_health", "studio_list_apps", "studio_create_app", "studio_app_status", "studio_validate_app", "studio_send_message", "studio_fix_app", "studio_fix_validation", "studio_rebuild_app", "studio_retry_app", "studio_import_site", "studio_import_github", "studio_import_app"})
STUDIO_TOOLS = frozenset({"studio_list_apps", "studio_create_app", "studio_app_status", "studio_validate_app", "studio_send_message", "studio_fix_app", "studio_fix_validation", "studio_rebuild_app", "studio_retry_app", "studio_import_site", "studio_import_github", "studio_import_app"})
DANGEROUS_PATTERNS = ("__import__", "eval(", "exec(", "os.system", "subprocess", "$(", "`", "../", "..\\", "&&")
MAX_STR_LEN = 5000
MAX_DEPTH = 5


def _scan(value, depth: int = 0) -> str | None:
    if depth > MAX_DEPTH:
        return "parâmetros aninhados demais"
    if value is None or isinstance(value, (bool, int, float)):
        return None
    if isinstance(value, str):
        if len(value) > MAX_STR_LEN:
            return "string de parâmetro longa demais"
        low = value.lower()
        for pattern in DANGEROUS_PATTERNS:
            if pattern in low:
                return f"padrão perigoso em parâmetro: {pattern!r}"
        return None
    if isinstance(value, (list, tuple)):
        for item in value:
            reason = _scan(item, depth + 1)
            if reason:
                return reason
        return None
    if isinstance(value, dict):
        for key, item in value.items():
            if not isinstance(key, str):
                return "chave de parâmetro não é string"
            reason = _scan(key, depth + 1) or _scan(item, depth + 1)
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
        if call.tool == "emit_alert" and "read_portfolio" not in history:
            return "emit_alert exige read_portfolio antes na mesma execução"
        if call.tool in STUDIO_TOOLS and "studio_health" not in history:
            return f"{call.tool} exige studio_health antes na mesma execução"
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






from __future__ import annotations
import re

SENSITIVE_KEY = re.compile(r"key|token|secret|password|passwd|authorization|credential|cookie|private", re.IGNORECASE)
_PATTERNS = (
    re.compile(r"gsk_[A-Za-z0-9]{16,}"),
    re.compile(r"sk-[A-Za-z0-9_\-]{16,}"),
    re.compile(r"AIza[0-9A-Za-z_\-]{20,}"),
    re.compile(r"gh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"github_pat_[A-Za-z0-9_]{20,}"),
    re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]{16,}"),
    re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)", re.DOTALL),
    re.compile(r"eyJ[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{10,}\.[A-Za-z0-9_\-]{5,}"),
)
MASK = "***"
MAX_STR = 300
MAX_DEPTH = 6
MAX_ITEMS = 50


def redact_text(text: str) -> str:
    for pattern in _PATTERNS:
        text = pattern.sub(MASK, text)
    if len(text) > MAX_STR:
        text = text[:MAX_STR] + "...[cortado]"
    return text


def redact(value, depth: int = 0):
    """Devolve uma cópia segura para log e auditoria: mascara por nome de campo e por padrão de valor,
    limita tamanho e profundidade. Nunca devolve o objeto original."""
    if depth > MAX_DEPTH:
        return "[profundo demais]"
    if value is None or isinstance(value, (bool, int, float)):
        return value
    if isinstance(value, str):
        return redact_text(value)
    if isinstance(value, dict):
        out = {}
        for i, (k, v) in enumerate(value.items()):
            if i >= MAX_ITEMS:
                out["..."] = "[itens omitidos]"
                break
            key = redact_text(str(k))
            out[key] = MASK if SENSITIVE_KEY.search(str(k)) else redact(v, depth + 1)
        return out
    if isinstance(value, (list, tuple, set, frozenset)):
        items = list(value)
        out = [redact(v, depth + 1) for v in items[:MAX_ITEMS]]
        if len(items) > MAX_ITEMS:
            out.append("[itens omitidos]")
        return out
    return f"<{type(value).__name__}>"

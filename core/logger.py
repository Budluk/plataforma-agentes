from __future__ import annotations
import json
import re
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

SENSITIVE = ("key", "token", "secret", "password", "authorization")
SECRET_PATTERNS = (
    re.compile(r"\b(?:bearer)\s+[A-Za-z0-9._\-]{8,}", re.IGNORECASE),
    re.compile(r"\bsk-[A-Za-z0-9_\-]{16,}"),
    re.compile(r"\bgh[pousr]_[A-Za-z0-9]{20,}"),
    re.compile(r"\bAIza[0-9A-Za-z_\-]{30,}"),
)
DEFAULT_MAX_BYTES = 5_000_000
DEFAULT_BACKUPS = 3


def _scrub(text: str) -> str:
    """Segredos também podem aparecer dentro de prompt/mensagem, não só como chave."""
    for pattern in SECRET_PATTERNS:
        text = pattern.sub("***", text)
    return text


def _redact(value):
    if isinstance(value, dict):
        return {k: ("***" if any(s in str(k).lower() for s in SENSITIVE) else _redact(v))
                for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_redact(v) for v in value]
    if isinstance(value, str):
        return _scrub(value)
    return value


_SIZED = (str, bytes, bytearray, list, tuple, dict, set, frozenset)


def param_metadata(params: dict[str, Any]) -> list[dict[str, Any]]:
    """Metadados estruturais de uma chamada, sem nenhum valor de parâmetro.

    A auditoria precisa correlacionar chamadas e medir tamanhos, mas não pode
    reconstruir prompt, mensagem ou URL (ADR-0004). Nomes, tipos e tamanhos
    bastam. Cada parâmetro vira um item de lista em vez de uma entrada de dict:
    assim um nome como ``inspiration_token`` não é confundido com uma chave
    sensível pela redação do ``JsonlLogger``.
    """
    return [
        {"name": str(name), "type": type(params[name]).__name__,
         "size": len(params[name]) if isinstance(params[name], _SIZED) else None}
        for name in sorted(params, key=str)
    ]


class JsonlLogger:
    def __init__(self, path, *, max_bytes: int = DEFAULT_MAX_BYTES, backups: int = DEFAULT_BACKUPS):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.max_bytes = max_bytes
        self.backups = max(0, backups)
        self._lock = threading.Lock()

    def _rotate(self) -> None:
        """Chamado sob lock, antes de cada escrita."""
        try:
            if self.path.stat().st_size < self.max_bytes:
                return
        except FileNotFoundError:
            return

        if self.backups == 0:
            self.path.unlink(missing_ok=True)
            return

        # .1 é o backup mais recente; .N, o mais antigo.
        for index in range(self.backups, 0, -1):
            source = self.path if index == 1 else self.path.with_name(f"{self.path.name}.{index - 1}")
            target = self.path.with_name(f"{self.path.name}.{index}")
            if source.exists():
                source.replace(target)

    def log(self, event: str, **fields) -> None:
        record = {"ts": datetime.now(timezone.utc).isoformat(), "event": event, **_redact(fields)}
        line = json.dumps(record, ensure_ascii=False, default=str)
        with self._lock:
            self._rotate()
            with open(self.path, "a", encoding="utf-8") as f:
                f.write(line + "\n")

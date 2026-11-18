from __future__ import annotations
import re
from dataclasses import dataclass, field
from core.contracts import ALLOWED_ASSETS

_URL = re.compile(r"https?://[^\s<>\"']+", re.IGNORECASE)


@dataclass
class AreaOutcome:
    ok: bool
    data: dict | None = None
    reasons: list[str] = field(default_factory=list)


def _norm(res) -> AreaOutcome:
    if hasattr(res, "approved"):  # resultado do pipeline financeiro
        return AreaOutcome(res.approved, res.alert.model_dump() if res.alert else None, list(res.reasons))
    return AreaOutcome(res.ok, res.data, list(res.reasons))


def _research(pipeline, text: str) -> AreaOutcome:
    m = _URL.search(text)
    if not m:
        return AreaOutcome(False, None, ["nenhuma URL encontrada no pedido"])
    url = m.group(0).rstrip(".,;:!?)]}")
    question = _URL.sub("", text).strip()[:300]
    if len(question) < 3:
        question = "Resuma esta página."
    return _norm(pipeline.run(url, question))


def _finance(pipeline, text: str, portfolio_provider) -> AreaOutcome:
    found = [a for a in sorted(ALLOWED_ASSETS) if re.search(rf"\b{re.escape(a)}\b", text, re.IGNORECASE)]
    if not found:
        return AreaOutcome(False, None, ["nenhum ativo permitido encontrado no pedido"])
    if len(found) > 1:
        return AreaOutcome(False, None, ["mais de um ativo no pedido; peça um por vez"])
    if portfolio_provider is None:
        return AreaOutcome(False, None, ["sem fonte de portfólio configurada (falha fechada)"])
    return _norm(pipeline.run(found[0], portfolio_provider()))


def build_handlers(*, finance=None, music=None, sales=None, funnel=None, research=None, dev=None,
                   studio=None, portfolio_provider=None) -> dict:
    h = {}
    if finance is not None:
        h["finance"] = lambda t: _finance(finance, t, portfolio_provider)
    if music is not None:
        h["music"] = lambda t: _norm(music.run(t))
    if sales is not None:
        h["sales"] = lambda t: _norm(sales.run(t))
    if funnel is not None:
        h["funnel"] = lambda t: _norm(funnel.run(t))
    if research is not None:
        h["research"] = lambda t: _research(research, t)
    if dev is not None:
        h["dev"] = lambda t: _norm(dev.write(t))
    if studio is not None:
        h["studio"] = lambda t: _norm(studio.run(t))
    return h

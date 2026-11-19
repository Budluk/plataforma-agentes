from __future__ import annotations
import uuid
from dataclasses import dataclass, field

from core.memory import safe_record_run


@dataclass
class CentralResult:
    area: str
    dispatched: bool
    ok: bool
    data: dict | None = None
    reasons: list[str] = field(default_factory=list)


class CentralPipeline:
    def __init__(self, router, handlers: dict, memory, logger):
        self.router, self.handlers, self.memory, self.logger = router, handlers, memory, logger

    def _finish(self, run_id: str, result: CentralResult, status: str) -> CentralResult:
        self.logger.log("central_result", run_id=run_id, area=result.area,
                        dispatched=result.dispatched, ok=result.ok)
        if not result.ok:
            self.logger.log("rejection", run_id=run_id, agent="central", reasons=result.reasons)
        warning = safe_record_run(self.memory, self.logger, "central", None, status,
                                  result.area, run_id=run_id)
        if warning:
            result.reasons.append(warning)
        return result

    def handle(self, text: str) -> CentralResult:
        run_id = uuid.uuid4().hex[:8]
        route = self.router.route(text, run_id)
        if route.area == "none":
            return self._finish(run_id, CentralResult("none", False, False, None, route.reasons), "none")
        handler = self.handlers.get(route.area)
        if handler is None:
            return self._finish(run_id, CentralResult(route.area, False, False, None,
                                [f"área {route.area!r} sem handler configurado"]), "no_handler")
        try:
            outcome = handler(route.text)
        except Exception as exc:  # falha fechada: erro inesperado nunca vira sucesso
            self.logger.log("handler_error", run_id=run_id, area=route.area, error=type(exc).__name__)
            return self._finish(run_id, CentralResult(route.area, True, False, None,
                                [f"erro interno na área {route.area}: {type(exc).__name__}"]), "error")
        return self._finish(run_id, CentralResult(route.area, True, outcome.ok, outcome.data, outcome.reasons),
                            "ok" if outcome.ok else "rejected")

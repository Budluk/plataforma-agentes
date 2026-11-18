from __future__ import annotations

import uuid
from dataclasses import dataclass, field

from agents.base_agent import RunContext


@dataclass
class TrendsResult:
    ok: bool
    data: dict | None = None
    reasons: list[str] = field(default_factory=list)


class TrendsPipeline:
    """Coleta de sinais de tendencia. Somente leitura.

    Nao passa pelo ActionGateway: o gateway existe para o que nao pode
    ser desfeito, e ler uma fonte publica pode. Nao publica nada, nunca.
    """

    def __init__(self, source, store, memory, logger):
        self.source = source
        self.store = store
        self.memory = memory
        self.logger = logger

    def _reject(self, ctx: RunContext, reasons: list[str]) -> TrendsResult:
        self.logger.log(
            "rejection", run_id=ctx.run_id,
            agent="trends_agent", reasons=reasons,
        )
        self.memory.record_run(
            "trends_agent", None, "rejected", "; ".join(reasons)
        )
        return TrendsResult(ok=False, reasons=reasons)

    def run(self) -> TrendsResult:
        ctx = RunContext(run_id=uuid.uuid4().hex[:8])

        try:
            candidates = self.source.collect()
        except Exception as exc:
            return self._reject(
                ctx, [f"falha na fonte: {type(exc).__name__}"]
            )

        if not candidates:
            return self._reject(ctx, ["fonte nao retornou candidatos"])

        gravadas = 0
        duplicadas = 0
        recusadas: list[str] = []

        for candidate in candidates:
            try:
                if self.store.save(candidate):
                    gravadas += 1
                else:
                    duplicadas += 1
            except (ValueError, TypeError) as exc:
                recusadas.append(f"{candidate.url}: {exc}")

        self.logger.log(
            "trends_collected", run_id=ctx.run_id,
            gravadas=gravadas, duplicadas=duplicadas,
            recusadas=len(recusadas),
        )

        if gravadas == 0 and duplicadas == 0:
            return self._reject(
                ctx, ["nenhum candidato valido", *recusadas[:3]]
            )

        self.memory.record_run(
            "trends_agent", None, "ok", f"{gravadas} novas"
        )

        return TrendsResult(ok=True, data={
            "novas": gravadas,
            "duplicadas": duplicadas,
            "recusadas": len(recusadas),
            "motivos": recusadas[:5],
        })

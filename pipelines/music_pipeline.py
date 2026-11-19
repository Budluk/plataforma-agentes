from __future__ import annotations
import json
import re
import uuid
from dataclasses import dataclass, field
from pydantic import ValidationError
from agents.base_agent import RunContext, ToolBlocked
from agents.music.agent import MusicAgent
from agents.music.contracts import (MAX_MIDI_NOTES, MAX_SEMITONES, MIN_SEMITONES,
                                    MusicRequest)
from agents.music.gate import check_request
from agents.music.tools import build_music_tools
from core.llm_client import LLMError

SYSTEM = ("Converta o pedido em JSON, SOMENTE o objeto, sem texto extra, com as chaves: "
          "action (identify_chord, transpose ou tab), notes (lista de números MIDI inteiros, "
          f"C4 = 60, no máximo {MAX_MIDI_NOTES} notas) e semitones "
          f"(inteiro de {MIN_SEMITONES} a {MAX_SEMITONES}, apenas em transpose).")
_FENCE = re.compile(r"^```(?:json)?\s*(.*?)\s*```$", re.DOTALL)


class MusicRequestInvalid(Exception):
    pass


def parse_request(raw: str) -> MusicRequest:
    text = raw.strip()
    m = _FENCE.match(text)
    if m:
        text = m.group(1)
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        raise MusicRequestInvalid("resposta do LLM não é JSON válido") from None
    if not isinstance(data, dict):
        raise MusicRequestInvalid("JSON do LLM não é um objeto")
    try:
        return MusicRequest.model_validate(data)
    except ValidationError as exc:
        raise MusicRequestInvalid(f"pedido falhou na validação ({exc.error_count()} erro(s))") from None


@dataclass
class MusicPipelineResult:
    ok: bool
    data: dict | None = None
    reasons: list[str] = field(default_factory=list)


class MusicPipeline:
    def __init__(self, llm, memory, permissions, logger, monitor):
        self.llm, self.memory, self.permissions = llm, memory, permissions
        self.logger, self.monitor = logger, monitor

    def _reject(self, ctx: RunContext, reasons: list[str]) -> MusicPipelineResult:
        self.logger.log("rejection", run_id=ctx.run_id, agent="music_agent", reasons=reasons)
        self.memory.record_run("music_agent", None, "rejected", "; ".join(reasons))
        return MusicPipelineResult(ok=False, reasons=reasons)

    def run(self, text: str) -> MusicPipelineResult:
        ctx = RunContext(run_id=uuid.uuid4().hex[:8])
        try:
            self.logger.log("llm_request", run_id=ctx.run_id, agent="music_agent")
            raw = self.llm.complete(SYSTEM, text)
            self.logger.log("llm_response", run_id=ctx.run_id, agent="music_agent", chars=len(raw))
            req = parse_request(raw)
        except (MusicRequestInvalid, LLMError) as exc:
            return self._reject(ctx, [f"{type(exc).__name__}: {exc}"])
        return self._execute(ctx, req)

    def run_request(self, req: MusicRequest) -> MusicPipelineResult:
        return self._execute(RunContext(run_id=uuid.uuid4().hex[:8]), req)

    def _execute(self, ctx: RunContext, req: MusicRequest) -> MusicPipelineResult:
        reasons = check_request(req)
        if reasons:
            return self._reject(ctx, reasons)
        agent = MusicAgent(tools=build_music_tools(), monitor=self.monitor,
                           permissions=self.permissions, logger=self.logger, ctx=ctx)
        try:
            data = agent.execute(req)
        except (ValueError, ToolBlocked) as exc:
            return self._reject(ctx, [f"{type(exc).__name__}: {exc}"])
        self.memory.record_run("music_agent", None, "ok", req.action)
        return MusicPipelineResult(ok=True, data=data)

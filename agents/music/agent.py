from __future__ import annotations
from agents.base_agent import BaseAgent
from agents.music.contracts import MusicRequest
from core.tool_registry import AGENT_TOOL


class MusicAgent(BaseAgent):
    name = "music_agent"

    def execute(self, req: MusicRequest) -> dict:
        params: dict = {"notes": list(req.notes)}
        if req.action == "transpose":
            params["semitones"] = req.semitones
        return self.call_tool(AGENT_TOOL[(self.name, req.action)], **params)

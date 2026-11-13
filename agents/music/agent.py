from __future__ import annotations
from agents.base_agent import BaseAgent
from agents.music.contracts import MusicRequest

TOOL_BY_ACTION = {"identify_chord": "identify_chord", "transpose": "transpose_notes", "tab": "to_guitar_tab"}


class MusicAgent(BaseAgent):
    name = "music_agent"

    def execute(self, req: MusicRequest) -> dict:
        params: dict = {"notes": list(req.notes)}
        if req.action == "transpose":
            params["semitones"] = req.semitones
        return self.call_tool(TOOL_BY_ACTION[req.action], **params)

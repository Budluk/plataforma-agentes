from __future__ import annotations
from agents.base_agent import BaseAgent
from core.tool_registry import AGENT_TOOL


class DevAgent(BaseAgent):
    name = "dev_agent"

    def analyze(self) -> dict:
        return self.call_tool(AGENT_TOOL[(self.name, "analyze")])

    def save(self, filename: str) -> dict:
        return self.call_tool(AGENT_TOOL[(self.name, "save")], filename=filename)

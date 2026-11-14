from __future__ import annotations
from agents.base_agent import BaseAgent


class DevAgent(BaseAgent):
    name = "dev_agent"

    def analyze(self) -> dict:
        return self.call_tool("analyze_code")

    def save(self, filename: str) -> dict:
        return self.call_tool("save_code_file", filename=filename)

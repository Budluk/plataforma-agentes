from __future__ import annotations
from agents.base_agent import BaseAgent
from agents.sales import funnel
from agents.sales.funnel_contracts import FunnelRequest
from core.tool_registry import AGENT_TOOL


def build_funnel_tools() -> dict:
    def analyze_funnel(**params) -> dict:
        return funnel.analyze(**params)

    return {AGENT_TOOL[("funnel_agent", "funnel")]: analyze_funnel}


class FunnelAgent(BaseAgent):
    name = "funnel_agent"

    def execute(self, req: FunnelRequest) -> dict:
        return self.call_tool(AGENT_TOOL[(self.name, "funnel")],
                              **req.model_dump(exclude={"product"}))

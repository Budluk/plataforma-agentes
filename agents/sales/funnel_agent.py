from __future__ import annotations
from agents.base_agent import BaseAgent
from agents.sales import funnel
from agents.sales.funnel_contracts import FunnelRequest


def build_funnel_tools() -> dict:
    def analyze_funnel(**params) -> dict:
        return funnel.analyze(**params)

    return {"analyze_funnel": analyze_funnel}


class FunnelAgent(BaseAgent):
    name = "sales_agent"

    def execute(self, req: FunnelRequest) -> dict:
        return self.call_tool("analyze_funnel", **req.model_dump(exclude={"product"}))

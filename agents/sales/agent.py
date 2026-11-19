from __future__ import annotations
from agents.base_agent import BaseAgent
from agents.sales.contracts import SalesRequest
from core.tool_registry import AGENT_TOOL


class SalesAgent(BaseAgent):
    name = "sales_agent"

    def execute(self, req: SalesRequest) -> dict:
        if req.action == "margin":
            params = {"unit_cost": req.unit_cost, "price": req.price}
        elif req.action == "price":
            params = {"unit_cost": req.unit_cost, "target_margin_pct": req.target_margin_pct,
                      "competitor_prices": list(req.competitor_prices)}
        else:
            params = {"unit_cost": req.unit_cost, "price": req.price, "fixed_costs": req.fixed_costs}
        return self.call_tool(AGENT_TOOL[(self.name, req.action)], **params)

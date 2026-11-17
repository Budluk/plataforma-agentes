from __future__ import annotations
from agents.base_agent import BaseAgent


class StudioAgent(BaseAgent):
    """Agente independente da área studio. Sem LLM: só ferramentas supervisionadas."""

    name = "studio_agent"

    def health(self) -> dict:
        return self.call_tool("studio_health")

    def list_apps(self) -> dict:
        return self.call_tool("studio_list_apps")

    def create_app(self, prompt: str) -> dict:
        return self.call_tool("studio_create_app", prompt=prompt)

    def app_status(self, project_id: str) -> dict:
        return self.call_tool("studio_app_status", project_id=project_id)

    def validate_app(self, project_id: str) -> dict:
        return self.call_tool("studio_validate_app", project_id=project_id)

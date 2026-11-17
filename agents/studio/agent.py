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

    def send_message(self, project_id: str, content: str) -> dict:
        return self.call_tool("studio_send_message", project_id=project_id, content=content)

    def fix_app(self, project_id: str) -> dict:
        return self.call_tool("studio_fix_app", project_id=project_id)

    def fix_validation(self, project_id: str) -> dict:
        return self.call_tool("studio_fix_validation", project_id=project_id)

    def rebuild_app(self, project_id: str) -> dict:
        return self.call_tool("studio_rebuild_app", project_id=project_id)

    def retry_app(self, project_id: str) -> dict:
        return self.call_tool("studio_retry_app", project_id=project_id)

    def import_site(self, url: str, prompt: str | None = None) -> dict:
        return self.call_tool("studio_import_site", url=url, prompt=prompt)

    def import_github(self, url: str) -> dict:
        return self.call_tool("studio_import_github", url=url)

    def import_app(self, project_id: str) -> dict:
        return self.call_tool("studio_import_app", project_id=project_id)

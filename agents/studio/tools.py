from __future__ import annotations
from agents.studio.client import StudioClient


def build_studio_tools(client: StudioClient) -> dict:
    def studio_health() -> dict:
        return client.health()

    def studio_list_apps() -> dict:
        return client.list_apps()

    def studio_create_app(prompt: str) -> dict:
        return client.create(prompt)

    def studio_app_status(project_id: str) -> dict:
        return client.status(project_id)

    def studio_validate_app(project_id: str) -> dict:
        return client.validate(project_id)

    return {
        "studio_health": studio_health,
        "studio_list_apps": studio_list_apps,
        "studio_create_app": studio_create_app,
        "studio_app_status": studio_app_status,
        "studio_validate_app": studio_validate_app,
    }

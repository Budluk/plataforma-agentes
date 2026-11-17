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

    def studio_send_message(project_id: str, content: str) -> dict:
        return client.send_message(project_id, content)

    def studio_fix_app(project_id: str) -> dict:
        return client.fix(project_id)

    def studio_fix_validation(project_id: str) -> dict:
        return client.fix_validation(project_id)

    def studio_rebuild_app(project_id: str) -> dict:
        return client.rebuild(project_id)

    def studio_retry_app(project_id: str) -> dict:
        return client.retry(project_id)

    def studio_list_versions(project_id: str) -> dict:
        return client.versions(project_id)

    def studio_restore_version(project_id: str, version: int) -> dict:
        return client.restore(project_id, version)

    def studio_import_site(url: str, prompt: str | None = None) -> dict:
        return client.import_site(url, prompt)

    def studio_import_github(url: str) -> dict:
        return client.import_github(url)

    def studio_import_app(project_id: str) -> dict:
        return client.import_app(project_id)

    return {
        "studio_health": studio_health,
        "studio_list_apps": studio_list_apps,
        "studio_create_app": studio_create_app,
        "studio_app_status": studio_app_status,
        "studio_validate_app": studio_validate_app,
        "studio_send_message": studio_send_message,
        "studio_fix_app": studio_fix_app,
        "studio_fix_validation": studio_fix_validation,
        "studio_rebuild_app": studio_rebuild_app,
        "studio_retry_app": studio_retry_app,
        "studio_list_versions": studio_list_versions,
        "studio_restore_version": studio_restore_version,
        "studio_import_site": studio_import_site,
        "studio_import_github": studio_import_github,
        "studio_import_app": studio_import_app,
    }

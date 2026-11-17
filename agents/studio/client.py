from __future__ import annotations
import json
from pathlib import Path
from urllib.parse import urlsplit
import httpx

MAX_RESPONSE_BYTES = 64_000
MAX_LIST_ITEMS = 20
MAX_TEXT = 200


class StudioError(Exception):
    """Falha fechada da área studio. Nunca vira sucesso."""


def load_studio_hosts(path) -> frozenset[str]:
    p = Path(path)
    if not p.exists():
        return frozenset()  # sem arquivo = nenhum host permitido (falha fechada)
    hosts = set()
    for line in p.read_text(encoding="utf-8").splitlines():
        entry = line.split("#", 1)[0].strip().lower()
        if entry:
            hosts.add(entry)
    return frozenset(hosts)


def _host_for_url(host: str) -> str:
    return f"[{host}]" if ":" in host else host


def parse_base_url(raw: str, allowed_hosts) -> str:
    """Aceita apenas http://loopback[:porta], sem caminho, query ou credenciais."""
    try:
        parts = urlsplit((raw or "").strip())
        port = parts.port
    except ValueError:
        raise StudioError("STUDIO_BASE_URL inválida") from None
    if parts.scheme != "http":
        raise StudioError("STUDIO_BASE_URL precisa usar http (serviço local)")
    if parts.username or parts.password:
        raise StudioError("STUDIO_BASE_URL não pode conter credenciais")
    if parts.query or parts.fragment:
        raise StudioError("STUDIO_BASE_URL não pode conter query nem fragmento")
    if parts.path not in ("", "/"):
        raise StudioError("STUDIO_BASE_URL não pode conter caminho")
    host = (parts.hostname or "").lower()
    if not host:
        raise StudioError("STUDIO_BASE_URL sem host")
    if host not in allowed_hosts:
        raise StudioError(f"host {host!r} não está em config/studio_hosts.txt")
    suffix = f":{port}" if port is not None else ""
    return f"http://{_host_for_url(host)}{suffix}"


def _text(value, limit: int = MAX_TEXT) -> str:
    return value.strip()[:limit] if isinstance(value, str) else ""


def _text_list(value, max_items: int = 8, limit: int = 40) -> list[str]:
    if not isinstance(value, list):
        return []
    return [_text(item, limit) for item in value[:max_items] if isinstance(item, str)]


def _int(value) -> int:
    return value if isinstance(value, int) and not isinstance(value, bool) else 0


def _summary(project: dict) -> dict:
    """Só campos conhecidos: nunca devolve buildLog, files, messages nem prompt."""
    return {
        "id": _text(project.get("id"), 36),
        "name": _text(project.get("name"), 80),
        "status": _text(project.get("status"), 20),
        "stage": _text(project.get("stage"), 120),
        "fileCount": _int(project.get("fileCount")),
        "updatedAt": _text(project.get("updatedAt"), 40),
    }


def _validation(value) -> dict | None:
    if not isinstance(value, dict):
        return None
    counts = value.get("counts") if isinstance(value.get("counts"), dict) else {}
    return {
        "status": _text(value.get("status"), 20),
        "blank": bool(value.get("blank")),
        "navigationError": _text(value.get("navigationError"), MAX_TEXT),
        "counts": {key: _int(counts.get(key)) for key in ("console", "page", "requests", "http", "images", "total")},
    }


class StudioClient:
    """Cliente HTTP mínimo para o CloneStudio local.

    Sem redirecionamento, sem proxy do ambiente, com teto de resposta e
    timeout. Toda resposta é reduzida a campos conhecidos antes de sair daqui.
    """

    def __init__(self, base_url: str, allowed_hosts, timeout: float = 30.0, transport=None):
        self.base_url = parse_base_url(base_url, allowed_hosts)
        self.timeout = float(timeout)
        self._client = httpx.Client(
            base_url=self.base_url,
            timeout=self.timeout,
            follow_redirects=False,
            trust_env=False,  # ignora HTTP(S)_PROXY: loopback não passa por proxy
            transport=transport,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self):
        return self

    def __exit__(self, *exc_info):
        self.close()

    def _request(self, method: str, path: str, payload: dict | None = None) -> dict:
        try:
            with self._client.stream(method, path, json=payload) as response:
                status = response.status_code
                if 300 <= status < 400:
                    raise StudioError("CloneStudio respondeu com redirecionamento; recusado")
                body = bytearray()
                for chunk in response.iter_bytes():
                    body.extend(chunk)
                    if len(body) > MAX_RESPONSE_BYTES:
                        raise StudioError("resposta do CloneStudio grande demais")
        except httpx.HTTPError as exc:
            raise StudioError(f"erro de rede: {type(exc).__name__}") from None
        if status >= 400:
            raise StudioError(f"CloneStudio respondeu HTTP {status}")
        try:
            data = json.loads(bytes(body))
        except (ValueError, UnicodeDecodeError):
            raise StudioError("resposta do CloneStudio não é JSON válido") from None
        if not isinstance(data, dict):
            raise StudioError("resposta do CloneStudio não é um objeto")
        return data

    # --- ações permitidas -------------------------------------------------
    def health(self) -> dict:
        data = self._request("GET", "/api/health")
        if data.get("ok") is not True:
            raise StudioError("CloneStudio não confirmou saúde")
        return {
            "ok": True,
            "name": _text(data.get("name"), 80),
            "version": _text(data.get("version"), 40),
            "providers": _text_list(data.get("providers")),
        }

    def list_apps(self) -> dict:
        data = self._request("GET", "/api/projects")
        projects = data.get("projects")
        if not isinstance(projects, list):
            raise StudioError("resposta sem lista de projetos")
        return {
            "count": len(projects),
            "projects": [_summary(p) for p in projects[:MAX_LIST_ITEMS] if isinstance(p, dict)],
        }

    def create(self, prompt: str) -> dict:
        data = self._request("POST", "/api/projects", {"prompt": prompt})
        project = data.get("project")
        if not isinstance(project, dict):
            raise StudioError("resposta sem projeto criado")
        summary = _summary(project)
        summary["previewUrl"] = _text(project.get("previewUrl"), 300)
        return summary

    def status(self, project_id: str) -> dict:
        data = self._request("GET", f"/api/projects/{project_id}?files=0")
        project = data.get("project")
        if not isinstance(project, dict):
            raise StudioError("resposta sem projeto")
        summary = _summary(project)
        summary["error"] = _text(project.get("error"), MAX_TEXT)
        summary["previewUrl"] = _text(project.get("previewUrl"), 300)
        summary["validation"] = _validation(project.get("validation"))
        return summary

    def validate(self, project_id: str) -> dict:
        data = self._request("POST", f"/api/projects/{project_id}/validate")
        project = data.get("project")
        if not isinstance(project, dict):
            raise StudioError("resposta sem projeto validado")
        return {"project": _summary(project), "validation": _validation(data.get("validation"))}

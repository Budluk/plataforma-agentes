from __future__ import annotations
import ipaddress
import json
from pathlib import Path
from urllib.parse import quote, urlsplit
import httpx

MAX_RESPONSE_BYTES = 64_000
MAX_LIST_ITEMS = 20
MAX_VERSIONS = 30
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


_LOOPBACK_NAMES = frozenset({"localhost", "localhost.localdomain"})


def _is_loopback_host(host: str) -> bool:
    """Aceita só loopback, mesmo que a lista de hosts tenha sido editada."""
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return host in _LOOPBACK_NAMES
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
        ip = ip.ipv4_mapped
    return ip.is_loopback


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
    if not _is_loopback_host(host):
        raise StudioError("STUDIO_BASE_URL precisa apontar para loopback")
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
        "currentVersion": _int(project.get("currentVersion")),
        "updatedAt": _text(project.get("updatedAt"), 40),
    }


def _detail(project: dict) -> dict:
    summary = _summary(project)
    summary["error"] = _text(project.get("error"), MAX_TEXT)
    summary["previewUrl"] = _text(project.get("previewUrl"), 300)
    summary["validation"] = _validation(project.get("validation"))
    return summary


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


def _version(value) -> dict | None:
    """Versão do histórico reduzida a campos conhecidos (sem hash nem messageId)."""
    if not isinstance(value, dict):
        return None
    number = _int(value.get("version"))
    if number < 1:
        return None
    return {
        "version": number,
        "label": _text(value.get("label"), 80),
        "kind": _text(value.get("kind"), 20),
        "createdAt": _text(value.get("createdAt"), 40),
        "fileCount": _int(value.get("fileCount")),
    }


def _opt_int(value) -> int | None:
    return value if isinstance(value, int) and not isinstance(value, bool) else None


def _opt_number(value) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    number = float(value)
    return number if number == number and number not in (float("inf"), float("-inf")) else None


def _inspiration(report) -> dict | None:
    """Análise social reduzida a campos conhecidos (sem HTML, avatar ou links)."""
    if not isinstance(report, dict):
        return None
    platform = _text(report.get("platform"), 20)
    if platform not in ("youtube", "tiktok", "instagram", "facebook"):
        return None
    metrics = report.get("metrics") if isinstance(report.get("metrics"), dict) else {}
    audience = report.get("audience") if isinstance(report.get("audience"), dict) else {}
    reach = report.get("reach") if isinstance(report.get("reach"), dict) else {}
    content = report.get("content") if isinstance(report.get("content"), dict) else {}
    return {
        "platform": platform,
        "platformLabel": _text(report.get("platformLabel"), 40),
        "url": _text(report.get("url"), 500),
        "title": _text(report.get("title"), 160),
        "description": _text(report.get("description"), 600),
        "handle": _text(report.get("handle"), 80),
        "metrics": {
            "followers": _opt_int(metrics.get("followers")),
            "following": _opt_int(metrics.get("following")),
            "posts": _opt_int(metrics.get("posts")),
            "totalViews": _opt_int(metrics.get("totalViews")),
            "totalLikes": _opt_int(metrics.get("totalLikes")),
            "totalComments": _opt_int(metrics.get("totalComments")),
            "engagementRate": _opt_number(metrics.get("engagementRate")),
        },
        "audience": {
            "size": _text(audience.get("size"), 40),
            "sizeLabel": _text(audience.get("sizeLabel"), 80),
            "summary": _text(audience.get("summary"), 400),
            "signals": _text_list(audience.get("signals"), 6, 60),
        },
        "reach": {
            "level": _text(reach.get("level"), 40),
            "summary": _text(reach.get("summary"), 400),
        },
        "content": {
            "themes": _text_list(content.get("themes"), 6, 60),
            "format": _text(content.get("format"), 80),
            "hashtags": _text_list(content.get("hashtags"), 12, 40),
            "pillars": _text_list(content.get("pillars"), 6, 60),
        },
        "hashtags": _text_list(report.get("hashtags"), 12, 40),
        "limitations": _text_list(report.get("limitations"), 8, 240),
        "fetchedAt": _text(report.get("fetchedAt"), 40),
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
        ident = quote(project_id, safe="")
        data = self._request("GET", f"/api/projects/{ident}?files=0")
        project = data.get("project")
        if not isinstance(project, dict):
            raise StudioError("resposta sem projeto")
        return _detail(project)

    def validate(self, project_id: str) -> dict:
        ident = quote(project_id, safe="")
        data = self._request("POST", f"/api/projects/{ident}/validate")
        project = data.get("project")
        if not isinstance(project, dict):
            raise StudioError("resposta sem projeto validado")
        return {"project": _summary(project), "validation": _validation(data.get("validation"))}

    # --- ações sobre um projeto existente --------------------------------
    def _action(self, project_id: str, action: str, payload: dict | None = None) -> dict:
        ident = quote(project_id, safe="")
        data = self._request("POST", f"/api/projects/{ident}/{action}", payload)
        project = data.get("project")
        if not isinstance(project, dict):
            raise StudioError(f"resposta sem projeto após {action}")
        return _detail(project)

    def send_message(self, project_id: str, content: str) -> dict:
        return self._action(project_id, "messages", {"content": content})

    def fix(self, project_id: str) -> dict:
        return self._action(project_id, "fix")

    def fix_validation(self, project_id: str) -> dict:
        return self._action(project_id, "fix-validation")

    def rebuild(self, project_id: str) -> dict:
        return self._action(project_id, "rebuild")

    def retry(self, project_id: str) -> dict:
        return self._action(project_id, "retry")

    # --- histórico de versões --------------------------------------------
    def versions(self, project_id: str) -> dict:
        ident = quote(project_id, safe="")
        data = self._request("GET", f"/api/projects/{ident}/versions")
        raw = data.get("versions")
        if not isinstance(raw, list):
            raise StudioError("resposta sem lista de versões")
        versions = [item for item in (_version(entry) for entry in raw[:MAX_VERSIONS]) if item]
        return {
            "currentVersion": _int(data.get("currentVersion")),
            "count": len(versions),
            "versions": versions,
        }

    def restore(self, project_id: str, version: int) -> dict:
        ident = quote(project_id, safe="")
        data = self._request("POST", f"/api/projects/{ident}/restore",
                             {"version": version})
        project = data.get("project")
        if not isinstance(project, dict):
            raise StudioError("resposta sem projeto após restore")
        detail = _detail(project)
        meta = _version(data.get("version"))
        detail["restoredVersion"] = meta["version"] if meta else _int(version)
        return detail

    # --- inspiração de redes sociais --------------------------------------
    def analyze_inspiration(self, url: str) -> dict:
        data = self._request("POST", "/api/inspiration/analyze", {"url": url})
        report = _inspiration(data.get("inspiration"))
        if report is None:
            raise StudioError("resposta sem análise de inspiração válida")
        token = _text(data.get("token"), 64)
        if len(token) < 32:
            raise StudioError("resposta sem token de inspiração")
        return {"token": token, "inspiration": report}

    def create_inspiration(self, inspiration_token: str, prompt: str | None = None) -> dict:
        payload = {"kind": "inspiration", "inspirationToken": inspiration_token}
        if prompt:
            payload["prompt"] = prompt
        data = self._request("POST", "/api/import", payload)
        project = data.get("project")
        if not isinstance(project, dict):
            raise StudioError("resposta sem projeto inspirado")
        if _text(data.get("kind"), 20) != "inspiration":
            raise StudioError("resposta não confirma criação por inspiração")
        detail = _detail(project)
        detail["kind"] = "inspiration"
        return detail

    # --- importação -------------------------------------------------------
    def _import(self, payload: dict) -> dict:
        data = self._request("POST", "/api/import", payload)
        project = data.get("project")
        if not isinstance(project, dict):
            raise StudioError("resposta sem projeto importado")
        detail = _detail(project)
        detail["kind"] = _text(data.get("kind"), 20)
        return detail

    def import_site(self, url: str, prompt: str | None = None) -> dict:
        payload = {"kind": "site", "url": url}
        if prompt:
            payload["prompt"] = prompt
        return self._import(payload)

    def import_github(self, url: str) -> dict:
        return self._import({"kind": "github", "url": url})

    def import_app(self, project_id: str) -> dict:
        return self._import({"kind": "app", "projectId": project_id})


from __future__ import annotations
import ipaddress
import re
from urllib.parse import urlsplit
from agents.studio.contracts import StudioRequest

_URL = re.compile(r"https?://|www\.", re.IGNORECASE)
_CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
_LABELS = {"prompt": "descrição", "message": "mensagem", "url": "URL",
           "inspiration_token": "token"}

# Bloqueio determinístico de destinos óbvios. Resolução de DNS, rebinding e
# redirecionamentos ficam com o serviço Node (clonestudio/server/net-safety.mjs),
# que resolve o domínio uma única vez e fixa o IP usado na conexão.
_BLOCKED_HOSTS = frozenset({"localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"})
_BLOCKED_SUFFIXES = (".local", ".localhost", ".internal", ".home.arpa")
_GITHUB_HOSTS = frozenset({"github.com", "www.github.com"})

# Análise de inspiração: só as quatro plataformas suportadas pelo serviço local.
_SOCIAL_HOSTS = frozenset({"youtube.com", "m.youtube.com", "youtu.be", "tiktok.com",
                           "instagram.com", "facebook.com", "fb.com", "m.facebook.com"})
_SOCIAL_SUFFIXES = (".youtube.com", ".tiktok.com", ".instagram.com", ".facebook.com")

_ID_ACTIONS = ("status", "validate", "fix", "fix_validation", "rebuild", "retry",
               "versions")


def _check_url(raw: str) -> list[str]:
    reasons: list[str] = []
    try:
        parts = urlsplit(raw.strip())
        port = parts.port
    except ValueError:
        return ["URL inválida"]
    if parts.scheme.lower() not in ("http", "https"):
        reasons.append("URL precisa usar http ou https")
    if parts.username or parts.password:
        reasons.append("URL não pode conter usuário/senha")
    if parts.fragment:
        reasons.append("URL não pode conter fragmento")
    host = (parts.hostname or "").strip().lower().rstrip(".")
    if not host:
        reasons.append("URL sem host")
    else:
        if host in _BLOCKED_HOSTS or host.endswith(_BLOCKED_SUFFIXES):
            reasons.append("URL local ou privada não é permitida")
        try:
            address = ipaddress.ip_address(host)
        except ValueError:
            address = None
        if address is not None and (address.is_private or address.is_loopback
                                    or address.is_link_local or address.is_multicast
                                    or address.is_reserved or address.is_unspecified):
            reasons.append("URL local ou privada não é permitida")
    if port is not None and not 0 < port < 65536:
        reasons.append("porta da URL inválida")
    return reasons


def _check_import(req: StudioRequest) -> list[str]:
    reasons: list[str] = []
    if req.kind is None:
        return ["importação exige kind (site, github ou app)"]
    if req.kind == "app":
        if req.project_id is None:
            reasons.append("importação de app exige project_id de origem")
        if req.url is not None:
            reasons.append("importação de app não aceita URL")
        if req.prompt is not None:
            reasons.append("importação de app não aceita descrição")
        return reasons
    if req.project_id is not None:
        reasons.append("importação de site/repositório não aceita project_id")
    if req.url is None:
        reasons.append("importação exige URL (falha fechada)")
    else:
        reasons.extend(_check_url(req.url))
        host = (urlsplit(req.url.strip()).hostname or "").lower()
        if req.kind == "github" and host not in _GITHUB_HOSTS:
            reasons.append("importação de repositório aceita apenas github.com")
    if req.kind == "github" and req.prompt is not None:
        reasons.append("importação de repositório não aceita descrição")
    return reasons


def is_social_host(host: str) -> bool:
    return host in _SOCIAL_HOSTS or host.endswith(_SOCIAL_SUFFIXES)


def _check_inspiration(req: StudioRequest) -> list[str]:
    """Análise pública: exige URL de YouTube, TikTok, Instagram ou Facebook."""
    reasons: list[str] = []
    if req.url is None:
        return ["análise de inspiração exige URL (falha fechada)"]
    reasons.extend(_check_url(req.url))
    host = (urlsplit(req.url.strip()).hostname or "").lower().rstrip(".")
    if not is_social_host(host):
        reasons.append("análise de inspiração aceita apenas YouTube, TikTok, Instagram ou Facebook")
    if req.project_id is not None:
        reasons.append("análise de inspiração não aceita project_id")
    if req.prompt is not None:
        reasons.append("análise de inspiração não aceita descrição")
    if req.message is not None:
        reasons.append("análise de inspiração não aceita mensagem")
    if req.kind is not None:
        reasons.append("análise de inspiração não aceita kind")
    if req.inspiration_token is not None:
        reasons.append("análise de inspiração não aceita token")
    return reasons


def _check_inspiration_create(req: StudioRequest) -> list[str]:
    """Criação a partir da análise: exige o token e aceita só a ideia opcional."""
    reasons: list[str] = []
    if req.inspiration_token is None:
        reasons.append("criação por inspiração exige o token da análise (falha fechada)")
    if req.project_id is not None:
        reasons.append("criação por inspiração não aceita project_id")
    if req.message is not None:
        reasons.append("criação por inspiração não aceita mensagem")
    if req.url is not None:
        reasons.append("criação por inspiração não aceita URL; use o token da análise")
    if req.kind is not None:
        reasons.append("criação por inspiração não aceita kind")
    return reasons


def check_request(req: StudioRequest) -> list[str]:
    """Gate determinístico da área studio. Qualquer dúvida rejeita."""
    reasons: list[str] = []
    for name, label in _LABELS.items():
        value = getattr(req, name)
        if value is not None and _CONTROL.search(value):
            reasons.append(f"{label} contém caractere de controle")

    if req.action != "restore" and req.version is not None:
        reasons.append(f"{req.action} não aceita version")

    if req.action == "create":
        if req.project_id is not None:
            reasons.append("criação não aceita project_id")
        if req.message is not None or req.url is not None or req.kind is not None:
            reasons.append("criação aceita apenas a descrição")
        if req.inspiration_token is not None:
            reasons.append("criação não aceita token de inspiração")
        if not (req.prompt or "").strip():
            reasons.append("descrição ausente (falha fechada)")
        elif _URL.search(req.prompt):
            reasons.append("descrição não pode conter URL; use a importação para sites e repositórios")
    elif req.action in _ID_ACTIONS:
        if req.project_id is None:
            reasons.append("project_id ausente (falha fechada)")
        if req.prompt is not None or req.message is not None or req.url is not None or req.kind is not None:
            reasons.append(f"{req.action} não aceita outros parâmetros")
        if req.inspiration_token is not None:
            reasons.append(f"{req.action} não aceita token de inspiração")
    elif req.action == "messages":
        if req.project_id is None:
            reasons.append("project_id ausente (falha fechada)")
        if req.message is None:
            reasons.append("mensagem ausente (falha fechada)")
        if req.prompt is not None or req.url is not None or req.kind is not None:
            reasons.append("messages aceita apenas project_id e mensagem")
        if req.inspiration_token is not None:
            reasons.append("messages não aceita token de inspiração")
    elif req.action == "import":
        reasons.extend(_check_import(req))
        if req.inspiration_token is not None:
            reasons.append("import não aceita token; use inspiration_create")
    elif req.action == "restore":
        if req.project_id is None:
            reasons.append("project_id ausente (falha fechada)")
        if req.version is None:
            reasons.append("restauração exige o número da versão (falha fechada)")
        if req.prompt is not None or req.message is not None or req.url is not None or req.kind is not None:
            reasons.append("restore aceita apenas project_id e version")
        if req.inspiration_token is not None:
            reasons.append("restore não aceita token de inspiração")
    elif req.action == "inspiration":
        reasons.extend(_check_inspiration(req))
    elif req.action == "inspiration_create":
        reasons.extend(_check_inspiration_create(req))
    else:  # health, list
        if any(getattr(req, name) is not None
               for name in ("prompt", "project_id", "message", "url", "kind",
                            "inspiration_token")):
            reasons.append(f"{req.action} não aceita parâmetros")
    return reasons

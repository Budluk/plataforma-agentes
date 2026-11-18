"""API HTTP local (loopback) para as 17 ferramentas da área studio.

A API é só uma porta de entrada: cada chamada continua passando por
contrato Pydantic -> gate -> BaseAgent.call_tool (monitor, permissões e log
JSONL) -> StudioClient. Nada aqui executa código gerado.

Uso:
    .\\.venv\\Scripts\\python.exe scripts\\studio_api.py

Endpoints (JSON):
    GET  /health                 liveness da API (não chama o CloneStudio)
    GET  /tools                  lista as ferramentas e seus parâmetros
    GET  /tools/<nome>           esquema de uma ferramenta
    POST /tools/<nome>           executa a ferramenta com um objeto JSON
    POST /run                    texto livre para StudioPipeline.run

Segurança: bind apenas em loopback, corpo limitado a 64 KB e, se
STUDIO_API_TOKEN estiver definido, Authorization: Bearer <token> é
obrigatório em todas as rotas. As chamadas ao pipeline são limitadas (excesso
devolve 503 JSON) e erros não previstos devolvem 500 JSON (sem detalhe
interno), registrados no JSONL de auditoria.
"""
from __future__ import annotations

import hmac
import json
import os
import sys
import threading
from dataclasses import dataclass
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

from agents.studio.client import StudioClient, StudioError, load_studio_hosts
from core.logger import JsonlLogger
from core.memory import Memory
from core.permissions import Permissions
from core.tool_monitor import ToolMonitor
from pipelines.studio_pipeline import StudioPipeline, StudioResult
from scripts.init_db import create_all

MAX_BODY_BYTES = 64 * 1024
MAX_CONCURRENT_CALLS = 4
DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8790
MIN_TOKEN_CHARS = 16
SERVICE = "studio-api"


@dataclass(frozen=True)
class ToolSpec:
    """Mapeia o nome público da ferramenta para o método do pipeline."""

    method: str
    description: str
    required: tuple[str, ...] = ()
    optional: tuple[str, ...] = ()
    integers: tuple[str, ...] = ()

    def schema(self, name: str) -> dict:
        return {
            "name": name,
            "description": self.description,
            "required": list(self.required),
            "optional": list(self.optional),
            "integers": list(self.integers),
        }


TOOL_SPECS: dict[str, ToolSpec] = {
    "studio_health": ToolSpec(
        "health", "Confirma que o CloneStudio local está saudável."),
    "studio_list_apps": ToolSpec(
        "list_apps", "Lista os apps do CloneStudio (até 20, sem código)."),
    "studio_create_app": ToolSpec(
        "create", "Cria um app React a partir de uma descrição.",
        required=("prompt",)),
    "studio_app_status": ToolSpec(
        "status", "Mostra o estado de um app, sem código nem logs.",
        required=("project_id",)),
    "studio_validate_app": ToolSpec(
        "validate", "Valida o preview de um app e devolve só as contagens.",
        required=("project_id",)),
    "studio_send_message": ToolSpec(
        "message", "Envia uma alteração por chat para um app.",
        required=("project_id", "content")),
    "studio_fix_app": ToolSpec(
        "fix", "Pede uma correção de build para um app.",
        required=("project_id",)),
    "studio_fix_validation": ToolSpec(
        "fix_validation", "Corrige problemas encontrados na validação do preview.",
        required=("project_id",)),
    "studio_rebuild_app": ToolSpec(
        "rebuild", "Recompila um app existente.",
        required=("project_id",)),
    "studio_retry_app": ToolSpec(
        "retry", "Tenta gerar de novo um app que falhou.",
        required=("project_id",)),
    "studio_list_versions": ToolSpec(
        "versions", "Lista o histórico de versões de um app.",
        required=("project_id",)),
    "studio_restore_version": ToolSpec(
        "restore", "Restaura uma versão do histórico e recompila.",
        required=("project_id", "version"), integers=("version",)),
    "studio_import_site": ToolSpec(
        "import_site", "Importa um site público como app.",
        required=("url",), optional=("prompt",)),
    "studio_import_github": ToolSpec(
        "import_github", "Importa um repositório público do github.com.",
        required=("url",)),
    "studio_import_app": ToolSpec(
        "import_app", "Cria um app a partir de outro app existente.",
        required=("project_id",)),
    "studio_analyze_inspiration": ToolSpec(
        "inspiration", "Analisa um canal/perfil público de rede social.",
        required=("url",)),
    "studio_create_inspiration": ToolSpec(
        "create_inspiration", "Cria um app original a partir de uma análise.",
        required=("inspiration_token",), optional=("prompt",)),
}

RUN_SPEC = ToolSpec("run", "Texto livre interpretado pela área studio.",
                    required=("text",))

LOOPBACK_HOSTS = frozenset({"127.0.0.1", "localhost"})


@dataclass(frozen=True)
class ApiResponse:
    status: int
    payload: dict


class _BodyTooLarge(Exception):
    pass


class _BadBody(Exception):
    pass


def _error(status: int, *reasons: str) -> ApiResponse:
    return ApiResponse(status, {"ok": False, "data": None, "reasons": list(reasons)})


def _result(result: StudioResult) -> ApiResponse:
    payload = {"ok": bool(result.ok), "data": result.data,
               "reasons": list(result.reasons)}
    return ApiResponse(200 if result.ok else 422, payload)


def _internal_error(logger, exc: BaseException) -> ApiResponse:
    """Erro não previsto: registra no JSONL e responde 500 sem vazar detalhe interno."""
    if logger is not None:
        try:
            logger.log("api_error", error=type(exc).__name__, detail=str(exc)[:300])
        except Exception:
            pass  # o log nunca pode impedir a resposta
    return _error(500, f"erro interno ({type(exc).__name__})")


def _execute(pipeline, method: str, params: dict, logger, limiter=None) -> ApiResponse:
    """Chama o pipeline com limite de concorrência e 500 controlado.

    O semáforo cobre só a chamada ao pipeline: descoberta, validação e erros
    de corpo não ocupam uma vaga, e rotas de liveness nunca ficam na fila.
    """
    acquired = False
    if limiter is not None:
        acquired = limiter.acquire(blocking=False)
        if not acquired:
            return _error(503, "limite de chamadas simultâneas atingido; tente novamente")
    try:
        return _result(getattr(pipeline, method)(**params))
    except Exception as exc:
        return _internal_error(logger, exc)
    finally:
        if acquired:
            limiter.release()


def _parse_body(body: bytes) -> dict | ApiResponse:
    if len(body) > MAX_BODY_BYTES:
        return _error(413, f"corpo maior que {MAX_BODY_BYTES} bytes")
    if not body.strip():
        return {}
    try:
        data = json.loads(body.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return _error(400, "corpo não é JSON válido")
    if not isinstance(data, dict):
        return _error(400, "corpo precisa ser um objeto JSON")
    return data


def _check_params(spec: ToolSpec, payload: dict) -> str | None:
    allowed = set(spec.required) | set(spec.optional)
    unknown = sorted(set(payload) - allowed)
    if unknown:
        return f"parâmetro(s) não aceito(s): {', '.join(unknown)}"
    missing = [name for name in spec.required if name not in payload]
    if missing:
        return f"parâmetro(s) obrigatório(s) ausente(s): {', '.join(missing)}"
    for name, value in payload.items():
        if name in spec.integers:
            if isinstance(value, bool) or not isinstance(value, int):
                return f"parâmetro {name!r} precisa ser inteiro"
        elif not isinstance(value, str):
            return f"parâmetro {name!r} precisa ser texto"
    return None


def _authorized(headers, token: str | None) -> bool:
    if not token:
        return True
    supplied = headers.get("Authorization", "") or ""
    expected = f"Bearer {token}"
    return hmac.compare_digest(supplied.encode("utf-8"), expected.encode("utf-8"))


def _host_allowed(headers) -> bool:
    """Recusa Host não-loopback (defesa contra DNS rebinding).

    Requisições HTTP/1.1 sempre trazem Host; a ausência só aparece em
    chamadas internas/testes, que não passam por socket.
    """
    raw = headers.get("Host")
    if not raw:
        return True
    try:
        host = (urlsplit(f"//{raw}").hostname or "").lower()
    except ValueError:
        return False
    return host in LOOPBACK_HOSTS


def _content_type_ok(headers, body: bytes) -> bool:
    if not body.strip():
        return True
    raw = (headers.get("Content-Type") or "").split(";", 1)[0].strip().lower()
    return raw == "application/json"


def dispatch(pipeline, *, method: str, target: str, headers, body: bytes,
             token: str | None = None, logger=None, limiter=None) -> ApiResponse:
    """Resolve uma requisição sem tocar em sockets (testável isoladamente)."""
    if not _host_allowed(headers):
        return _error(400, "Host não permitido; use 127.0.0.1 ou localhost")
    if not _authorized(headers, token):
        return _error(401, "token ausente ou inválido")
    if method.upper() == "POST" and not _content_type_ok(headers, body):
        return _error(415, "Content-Type precisa ser application/json")

    method = method.upper()
    path = urlsplit(target).path or "/"

    if path == "/health":
        if method != "GET":
            return _error(405, "método não permitido; use GET")
        return ApiResponse(200, {"ok": True, "service": SERVICE,
                                 "tools": len(TOOL_SPECS)})

    if path == "/tools":
        if method != "GET":
            return _error(405, "método não permitido; use GET")
        return ApiResponse(200, {
            "ok": True,
            "tools": [spec.schema(name) for name, spec in TOOL_SPECS.items()],
        })

    if path == "/run":
        if method != "POST":
            return _error(405, "método não permitido; use POST")
        parsed = _parse_body(body)
        if isinstance(parsed, ApiResponse):
            return parsed
        problem = _check_params(RUN_SPEC, parsed)
        if problem:
            return _error(400, problem)
        return _execute(pipeline, "run", parsed, logger, limiter)

    if path.startswith("/tools/"):
        name = path[len("/tools/"):]
        spec = TOOL_SPECS.get(name)
        if spec is None:
            return _error(404, f"ferramenta desconhecida: {name!r}")
        if method == "GET":
            return ApiResponse(200, {"ok": True, "tool": spec.schema(name)})
        if method != "POST":
            return _error(405, "método não permitido; use GET ou POST")
        parsed = _parse_body(body)
        if isinstance(parsed, ApiResponse):
            return parsed
        problem = _check_params(spec, parsed)
        if problem:
            return _error(400, problem)
        return _execute(pipeline, spec.method, parsed, logger, limiter)

    return _error(404, "rota não encontrada")


class StudioApiHandler(BaseHTTPRequestHandler):
    server_version = "StudioAPI/1.0"
    protocol_version = "HTTP/1.1"

    def do_GET(self):  # noqa: N802 (nome exigido por BaseHTTPRequestHandler)
        self._handle("GET")

    def do_POST(self):  # noqa: N802
        self._handle("POST")

    def do_PUT(self):  # noqa: N802
        self._handle("PUT")

    def do_DELETE(self):  # noqa: N802
        self._handle("DELETE")

    def _handle(self, method: str) -> None:
        try:
            body = self._read_body()
        except _BodyTooLarge as exc:
            self._send(_error(413, str(exc)))
            self.close_connection = True
            return
        except _BadBody as exc:
            self._send(_error(400, str(exc)))
            self.close_connection = True
            return
        try:
            response = dispatch(self.server.pipeline, method=method, target=self.path,
                                headers=self.headers, body=body,
                                token=self.server.token, logger=self.server.logger,
                                limiter=self.server.pipeline_slots)
        except Exception as exc:  # bug na própria API: responde 500 em vez de derrubar a conexão
            response = _internal_error(self.server.logger, exc)
        self._send(response)

    def _read_body(self) -> bytes:
        if self.headers.get("Transfer-Encoding"):
            raise _BadBody("Transfer-Encoding não é suportado; envie Content-Length")
        raw = self.headers.get("Content-Length")
        if raw is None:
            return b""
        try:
            length = int(raw)
        except ValueError:
            raise _BadBody("Content-Length inválido") from None
        if length < 0:
            raise _BadBody("Content-Length inválido")
        if length > MAX_BODY_BYTES:
            raise _BodyTooLarge(f"corpo maior que {MAX_BODY_BYTES} bytes")
        return self.rfile.read(length) if length else b""

    def _send(self, response: ApiResponse) -> None:
        body = json.dumps(response.payload, ensure_ascii=False).encode("utf-8")
        self.send_response(response.status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format, *args):  # noqa: A002 (assinatura da stdlib)
        # O log de auditoria é o JSONL do pipeline; não poluir o stderr.
        pass


class StudioApiServer(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = True

    def __init__(self, address, pipeline, token: str | None = None,
                 max_concurrent_calls: int = MAX_CONCURRENT_CALLS):
        super().__init__(address, StudioApiHandler)
        if max_concurrent_calls < 1:
            raise ValueError("max_concurrent_calls precisa ser pelo menos 1")
        self.pipeline = pipeline
        self.token = token
        # Só um JsonlLogger de verdade serve para registrar erros da API; um
        # pipeline de teste pode não ter logger (ou ter um atributo qualquer).
        logger = getattr(pipeline, "logger", None)
        self.logger = logger if isinstance(logger, JsonlLogger) else None
        # O CloneStudio tem fila única de builds; limitar as chamadas evita
        # contenção no SQLite/JSONL sem transformar o servidor em fila única:
        # caminhos de liveness e descoberta não passam por este semáforo.
        self.pipeline_slots = threading.BoundedSemaphore(max_concurrent_calls)

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionResetError, ConnectionAbortedError, BrokenPipeError)):
            return  # cliente fechou a conexão; não é erro do servidor
        super().handle_error(request, client_address)


def parse_host(raw: str) -> str:
    """Aceita só loopback; normaliza localhost para 127.0.0.1."""
    host = (raw or "").strip().lower()
    if host not in LOOPBACK_HOSTS:
        raise ValueError("STUDIO_API_HOST precisa ser loopback (127.0.0.1 ou localhost)")
    return DEFAULT_HOST


def build_pipeline() -> StudioPipeline:
    db = ROOT / "data" / "sqlite.db"
    create_all(db)
    client = StudioClient(
        os.getenv("STUDIO_BASE_URL") or "http://127.0.0.1:8787",
        load_studio_hosts(ROOT / "config" / "studio_hosts.txt"),
        timeout=float(os.getenv("STUDIO_TIMEOUT_MS") or 30000) / 1000.0,
    )
    return StudioPipeline(
        client, Memory(db), Permissions(db),
        JsonlLogger(ROOT / "data" / "logs" / "studio.jsonl"), ToolMonitor())


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
    load_dotenv(ROOT / ".env")
    try:
        host = parse_host(os.getenv("STUDIO_API_HOST") or DEFAULT_HOST)
        port = int(os.getenv("STUDIO_API_PORT") or DEFAULT_PORT)
    except ValueError as exc:
        print(f"ERRO: {exc}", file=sys.stderr)
        return 1
    if not 0 < port < 65536:
        print("ERRO: STUDIO_API_PORT fora da faixa 1..65535", file=sys.stderr)
        return 1
    token = (os.getenv("STUDIO_API_TOKEN") or "").strip() or None
    if token is not None and len(token) < MIN_TOKEN_CHARS:
        print(f"ERRO: STUDIO_API_TOKEN precisa ter ao menos {MIN_TOKEN_CHARS} caracteres",
              file=sys.stderr)
        return 1

    try:
        pipeline = build_pipeline()
    except (StudioError, ValueError) as exc:
        print("ERRO ao preparar o cliente studio:", exc, file=sys.stderr)
        return 1

    server = StudioApiServer((host, port), pipeline, token)
    print(f"Studio API em http://{host}:{port} "
          f"(auth={'token' if token else 'loopback'})", file=sys.stderr)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
        pipeline.client.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())

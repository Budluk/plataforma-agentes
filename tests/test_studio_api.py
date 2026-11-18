import json
import threading
from concurrent.futures import ThreadPoolExecutor
from urllib.parse import quote

import httpx
import pytest

from agents.studio.client import StudioClient
from core.logger import JsonlLogger
from core.tool_monitor import STUDIO_TOOLS
from pipelines.studio_pipeline import StudioPipeline, StudioResult
from scripts.studio_api import (MAX_BODY_BYTES, TOOL_SPECS, StudioApiServer,
                                dispatch, parse_host)

PROJECT = "123e4567-e89b-42d3-a456-426614174000"
TOKEN = "t" * 32
HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})


class FakePipeline:
    """Registra a chamada e devolve um resultado fixo, sem rede."""

    def __init__(self, result=None):
        self.calls = []
        self.result = result or StudioResult(ok=True, data={"ok": True})

    def __getattr__(self, name):
        def call(**params):
            self.calls.append((name, params))
            return self.result
        return call


class BoomPipeline:
    """Estoura em qualquer chamada, para testar o 500 controlado da API."""

    def __init__(self, logger=None):
        self.logger = logger

    def __getattr__(self, name):
        def call(**params):
            raise RuntimeError("falha inesperada")
        return call


class BlockingPipeline:
    """Segura a chamada até `release` para testar concorrência sem dormir."""

    def __init__(self, release):
        self.release = release
        self.started = threading.Event()
        self.calls = []

    def __getattr__(self, name):
        def call(**params):
            self.calls.append((name, params))
            self.started.set()
            self.release.wait(timeout=5)
            return StudioResult(ok=True, data={"count": 0})
        return call


def call(pipeline, method, target, body=b"", headers=None, token=None, logger=None):
    merged = dict(headers or {})
    if body and "Content-Type" not in merged:
        merged["Content-Type"] = "application/json"
    return dispatch(pipeline, method=method, target=target, headers=merged,
                    body=body, token=token, logger=logger)


def make_client(handler, base="http://127.0.0.1:8787"):
    return StudioClient(base, HOSTS, timeout=2.0, transport=httpx.MockTransport(handler))


def routes_handler(routes, calls=None):
    def handler(request):
        if calls is not None:
            calls.append({"method": request.method, "path": request.url.path})
        key = (request.method, request.url.path)
        if key not in routes:
            return httpx.Response(404, json={"error": "não encontrado"})
        value = routes[key]
        return value(request) if callable(value) else httpx.Response(200, json=value)
    return handler


def real_pipeline(env, routes, calls=None):
    return StudioPipeline(make_client(routes_handler(routes, calls)), env.memory,
                          env.perms, env.logger, env.monitor)


def test_project_id_is_url_encoded_in_every_path():
    hostile = "abc/../segredo?x=1#y"
    encoded = quote(hostile, safe="")
    seen = []
    project = {"id": hostile, "name": "App", "status": "ready"}

    def handler(request):
        seen.append(request.url.raw_path.decode("utf-8"))
        return httpx.Response(200, json={
            "project": project,
            "validation": {},
            "versions": [],
            "currentVersion": 0,
        })

    client = StudioClient("http://127.0.0.1:8787", HOSTS,
                          transport=httpx.MockTransport(handler))
    try:
        assert client.status(hostile)["status"] == "ready"
        assert client.validate(hostile)["project"]["id"] == hostile[:36]
        assert client.fix(hostile)["status"] == "ready"
        assert client.versions(hostile)["count"] == 0
        assert client.restore(hostile, 1)["restoredVersion"] == 1
    finally:
        client.close()

    assert seen == [
        f"/api/projects/{encoded}?files=0",
        f"/api/projects/{encoded}/validate",
        f"/api/projects/{encoded}/fix",
        f"/api/projects/{encoded}/versions",
        f"/api/projects/{encoded}/restore",
    ]


# --- catálogo e descoberta ------------------------------------------------
def test_tools_match_the_supervision_registry():
    assert set(TOOL_SPECS) == STUDIO_TOOLS | {"studio_health"}
    assert len(TOOL_SPECS) == 17
    for spec in TOOL_SPECS.values():
        assert callable(getattr(StudioPipeline, spec.method))


def test_health_is_liveness_only_and_does_not_touch_the_studio():
    fake = FakePipeline()
    response = call(fake, "GET", "/health")
    assert response.status == 200
    assert response.payload == {"ok": True, "service": "studio-api", "tools": 17}
    assert fake.calls == []


def test_tools_lists_required_optional_and_integer_parameters():
    response = call(FakePipeline(), "GET", "/tools")
    assert response.status == 200
    tools = {item["name"]: item for item in response.payload["tools"]}
    assert set(tools) == set(TOOL_SPECS)
    assert tools["studio_health"]["required"] == []
    assert tools["studio_restore_version"]["required"] == ["project_id", "version"]
    assert tools["studio_restore_version"]["integers"] == ["version"]
    assert tools["studio_import_site"]["optional"] == ["prompt"]
    assert tools["studio_create_inspiration"]["optional"] == ["prompt"]


def test_get_single_tool_schema():
    response = call(FakePipeline(), "GET", "/tools/studio_create_app")
    assert response.status == 200
    assert response.payload["tool"]["required"] == ["prompt"]


def test_query_string_is_ignored_for_routing():
    response = call(FakePipeline(), "GET", "/tools/studio_health?x=1")
    assert response.status == 200


# --- erros de rota e de corpo ---------------------------------------------
def test_unknown_tool_is_404_and_never_calls_the_pipeline():
    fake = FakePipeline()
    response = call(fake, "POST", "/tools/studio_executar", body=b"{}")
    assert response.status == 404 and "desconhecida" in response.payload["reasons"][0]
    assert fake.calls == []


def test_unknown_route_is_404():
    response = call(FakePipeline(), "GET", "/api/projects")
    assert response.status == 404 and response.payload["ok"] is False


def test_wrong_method_is_405():
    assert call(FakePipeline(), "POST", "/health", body=b"{}").status == 405
    assert call(FakePipeline(), "GET", "/run").status == 405
    assert call(FakePipeline(), "PUT", "/tools/studio_health", body=b"{}").status == 405


@pytest.mark.parametrize("body", [b"{", b"[]", b"null", b'"texto"', b"\xff"])
def test_bad_json_body_is_400(body):
    response = call(FakePipeline(), "POST", "/tools/studio_health", body=body)
    assert response.status == 400 and response.payload["ok"] is False


def test_oversized_body_is_413():
    response = call(FakePipeline(), "POST", "/tools/studio_health",
                    body=b"x" * (MAX_BODY_BYTES + 1))
    assert response.status == 413 and "maior" in response.payload["reasons"][0]


@pytest.mark.parametrize("tool,body,needle", [
    ("studio_create_app", {"prompt": "loja de café com carrinho", "run": True},
     "não aceito"),
    ("studio_create_app", {}, "obrigatório"),
    ("studio_app_status", {"project_id": 123}, "texto"),
    ("studio_restore_version", {"project_id": PROJECT, "version": True}, "inteiro"),
    ("studio_restore_version", {"project_id": PROJECT, "version": "2"}, "inteiro"),
    ("studio_import_site", {"url": "https://example.com", "project_id": PROJECT},
     "não aceito"),
])
def test_invalid_params_are_400_without_calling_the_pipeline(tool, body, needle):
    fake = FakePipeline()
    response = call(fake, "POST", f"/tools/{tool}", body=json.dumps(body).encode())
    assert response.status == 400 and needle in response.payload["reasons"][0]
    assert fake.calls == []


# --- autenticação opcional ------------------------------------------------
def test_token_is_required_for_every_route_when_configured():
    fake = FakePipeline()
    requests = [("GET", "/health", b""), ("GET", "/tools", b""),
                ("POST", "/tools/studio_health", b"{}"),
                ("POST", "/run", b'{"text":"listar"}')]
    wrong = {"Authorization": "Bearer " + "x" * 32}
    for method, target, body in requests:
        assert call(fake, method, target, body=body, token=TOKEN).status == 401
        assert call(fake, method, target, body=body, headers=wrong,
                    token=TOKEN).status == 401
    assert fake.calls == []


def test_valid_token_allows_the_call():
    fake = FakePipeline()
    response = call(fake, "POST", "/tools/studio_list_apps", body=b"{}",
                    headers={"Authorization": f"Bearer {TOKEN}"}, token=TOKEN)
    assert response.status == 200
    assert fake.calls == [("list_apps", {})]


def test_without_a_configured_token_loopback_requests_are_allowed():
    response = call(FakePipeline(), "GET", "/health")
    assert response.status == 200


def test_host_header_must_be_loopback_when_present():
    fake = FakePipeline()
    assert call(fake, "GET", "/health", headers={"Host": "evil.example"}).status == 400
    assert call(fake, "GET", "/health",
                headers={"Host": "127.0.0.1:8790"}).status == 200
    assert call(fake, "GET", "/health",
                headers={"Host": "localhost:8790"}).status == 200
    assert fake.calls == []


def test_post_body_requires_json_content_type():
    fake = FakePipeline()
    response = dispatch(fake, method="POST", target="/tools/studio_health",
                        headers={}, body=b"{}")
    assert response.status == 415
    assert "application/json" in response.payload["reasons"][0]
    assert fake.calls == []


# --- execução -------------------------------------------------------------
def test_tool_success_returns_200_and_the_pipeline_data():
    fake = FakePipeline(StudioResult(ok=True, data={"id": PROJECT}))
    body = json.dumps({"prompt": "loja de café com carrinho"}).encode()
    response = call(fake, "POST", "/tools/studio_create_app", body=body)
    assert response.status == 200
    assert response.payload == {"ok": True, "data": {"id": PROJECT}, "reasons": []}
    assert fake.calls == [("create", {"prompt": "loja de café com carrinho"})]


def test_pipeline_rejection_returns_422():
    fake = FakePipeline(StudioResult(ok=False, reasons=["pedido inválido"]))
    response = call(fake, "POST", "/tools/studio_create_app",
                    body=json.dumps({"prompt": "curto"}).encode())
    assert response.status == 422
    assert response.payload["ok"] is False
    assert response.payload["reasons"] == ["pedido inválido"]


def test_run_maps_text_to_the_pipeline():
    fake = FakePipeline()
    response = call(fake, "POST", "/run",
                    body=json.dumps({"text": "listar meus apps"}).encode())
    assert response.status == 200
    assert fake.calls == [("run", {"text": "listar meus apps"})]


@pytest.mark.parametrize("body", [{}, {"text": "ok", "area": "studio"},
                                  {"text": 1}])
def test_run_rejects_missing_extra_or_non_text_fields(body):
    fake = FakePipeline()
    response = call(fake, "POST", "/run", body=json.dumps(body).encode())
    assert response.status == 400
    assert fake.calls == []


# --- integração com o pipeline real (gate, monitor e log) -----------------
def test_api_path_keeps_the_mandatory_health_probe(env):
    calls = []
    pipeline = real_pipeline(env, {
        ("GET", "/api/health"): {"ok": True},
        ("GET", "/api/projects"): {"projects": []},
    }, calls)
    response = call(pipeline, "POST", "/tools/studio_list_apps", body=b"{}")
    assert response.status == 200 and response.payload["data"]["count"] == 0
    assert [c["path"] for c in calls] == ["/api/health", "/api/projects"]


def test_health_tool_calls_only_the_studio_health(env):
    calls = []
    pipeline = real_pipeline(env, {
        ("GET", "/api/health"): {"ok": True, "name": "CloneStudio AI"},
    }, calls)
    response = call(pipeline, "POST", "/tools/studio_health", body=b"{}")
    assert response.status == 200 and response.payload["data"]["ok"] is True
    assert [c["path"] for c in calls] == ["/api/health"]


def test_gate_rejection_is_reported_as_422_without_http(env):
    calls = []
    pipeline = real_pipeline(env, {}, calls)
    response = call(pipeline, "POST", "/tools/studio_create_app",
                    body=json.dumps({"prompt": "curto"}).encode())
    assert response.status == 422 and response.payload["reasons"]
    assert calls == []


def test_permissions_and_monitor_events_are_logged(env):
    pipeline = real_pipeline(env, {
        ("GET", "/api/health"): {"ok": True},
        ("GET", "/api/projects"): {"projects": []},
    })
    assert call(pipeline, "POST", "/tools/studio_list_apps", body=b"{}").status == 200
    events = [e for e in env.events() if e["event"] == "tool_call_attempt"]
    assert [e["tool"] for e in events] == ["studio_health", "studio_list_apps"]


# --- servidor real --------------------------------------------------------
def test_parse_host_accepts_only_loopback():
    assert parse_host("127.0.0.1") == "127.0.0.1"
    assert parse_host("localhost") == "127.0.0.1"
    assert parse_host(" LOCALHOST ") == "127.0.0.1"
    for bad in ("0.0.0.0", "192.168.0.10", "example.com", "", "::"):
        with pytest.raises(ValueError):
            parse_host(bad)


def test_real_http_server_roundtrip(env):
    calls = []
    pipeline = real_pipeline(env, {
        ("GET", "/api/health"): {"ok": True},
        ("GET", "/api/projects"): {"projects": []},
    }, calls)
    server = StudioApiServer(("127.0.0.1", 0), pipeline, token=TOKEN)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = server.server_address[:2]
        headers = {"Authorization": f"Bearer {TOKEN}"}
        with httpx.Client(base_url=f"http://{host}:{port}", timeout=5.0,
                          trust_env=False) as client:
            health = client.get("/health", headers=headers)
            assert health.status_code == 200
            assert health.json()["service"] == "studio-api"
            assert client.get("/health").status_code == 401
            result = client.post("/tools/studio_list_apps", headers=headers)
            assert result.status_code == 200
            assert result.json()["data"]["count"] == 0
            assert client.post("/tools/studio_nope", headers=headers).status_code == 404
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)
        pipeline.client.close()


def test_real_http_server_handles_concurrent_calls(env):
    pipeline = real_pipeline(env, {
        ("GET", "/api/health"): {"ok": True},
        ("GET", "/api/projects"): {"projects": []},
    })
    server = StudioApiServer(("127.0.0.1", 0), pipeline)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = server.server_address[:2]
        base = f"http://{host}:{port}"

        def call_list(_):
            with httpx.Client(base_url=base, timeout=10.0, trust_env=False) as client:
                return client.post("/tools/studio_list_apps").status_code

        try:
            with ThreadPoolExecutor(max_workers=4) as pool:
                statuses = list(pool.map(call_list, range(8)))
        finally:
            pipeline.client.close()
        assert statuses == [200] * 8
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_health_and_metadata_are_answered_while_a_tool_is_running():
    release = threading.Event()
    pipeline = BlockingPipeline(release)
    server = StudioApiServer(("127.0.0.1", 0), pipeline)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    pool = ThreadPoolExecutor(max_workers=1)
    thread.start()
    try:
        host, port = server.server_address[:2]
        base = f"http://{host}:{port}"

        def post_list():
            with httpx.Client(base_url=base, timeout=5.0, trust_env=False) as client:
                return client.post("/tools/studio_list_apps")

        running = pool.submit(post_list)
        assert pipeline.started.wait(timeout=5)
        with httpx.Client(base_url=base, timeout=5.0, trust_env=False) as client:
            assert client.get("/health").status_code == 200
            assert client.get("/tools").status_code == 200
            assert client.get("/tools/studio_list_apps").status_code == 200
        release.set()
        assert running.result(timeout=5).status_code == 200
    finally:
        release.set()
        pool.shutdown(wait=True)
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def test_saturated_pipeline_returns_503_without_queueing():
    release = threading.Event()
    pipeline = BlockingPipeline(release)
    server = StudioApiServer(("127.0.0.1", 0), pipeline, max_concurrent_calls=1)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    pool = ThreadPoolExecutor(max_workers=2)
    thread.start()
    try:
        host, port = server.server_address[:2]
        base = f"http://{host}:{port}"

        def post_list():
            with httpx.Client(base_url=base, timeout=5.0, trust_env=False) as client:
                return client.post("/tools/studio_list_apps")

        running = pool.submit(post_list)
        assert pipeline.started.wait(timeout=5)
        rejected = pool.submit(post_list).result(timeout=5)
        assert rejected.status_code == 503
        assert "simultâneas" in rejected.json()["reasons"][0]
        assert len(pipeline.calls) == 1

        release.set()
        assert running.result(timeout=5).status_code == 200
        with httpx.Client(base_url=base, timeout=5.0, trust_env=False) as client:
            assert client.post("/tools/studio_list_apps").status_code == 200
        assert len(pipeline.calls) == 2
    finally:
        release.set()
        pool.shutdown(wait=True)
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


# --- erros inesperados nunca cortam a conexão -----------------------------
def read_events(path):
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()]


def test_unexpected_pipeline_error_is_500_and_logged(tmp_path):
    logger = JsonlLogger(tmp_path / "api.jsonl")
    response = call(BoomPipeline(logger), "POST", "/tools/studio_list_apps", b"{}", logger=logger)

    assert response.status == 500
    assert response.payload["ok"] is False
    assert "falha inesperada" not in json.dumps(response.payload)
    events = read_events(tmp_path / "api.jsonl")
    assert events[-1]["event"] == "api_error"
    assert events[-1]["error"] == "RuntimeError"


def test_unexpected_error_on_run_is_500(tmp_path):
    logger = JsonlLogger(tmp_path / "api.jsonl")
    body = json.dumps({"text": "criar um app de tarefas"}).encode()
    response = call(BoomPipeline(logger), "POST", "/run", body, logger=logger)
    assert response.status == 500
    assert response.payload["reasons"] == ["erro interno (RuntimeError)"]


def test_error_does_not_break_the_next_request(tmp_path):
    logger = JsonlLogger(tmp_path / "api.jsonl")
    boom = BoomPipeline(logger)
    assert call(boom, "POST", "/tools/studio_list_apps", b"{}", logger=logger).status == 500

    ok = FakePipeline()
    response = call(ok, "POST", "/tools/studio_list_apps", b"{}", logger=logger)
    assert response.status == 200
    assert ok.calls == [("list_apps", {})]


def test_limiter_is_released_after_an_unexpected_error(tmp_path):
    logger = JsonlLogger(tmp_path / "api.jsonl")
    limiter = threading.BoundedSemaphore(1)
    response = dispatch(BoomPipeline(logger), method="POST",
                        target="/tools/studio_list_apps",
                        headers={"Content-Type": "application/json"}, body=b"{}",
                        logger=logger, limiter=limiter)
    assert response.status == 500
    assert limiter.acquire(blocking=False)
    limiter.release()


def test_real_http_server_unexpected_error_is_500(tmp_path):
    logger = JsonlLogger(tmp_path / "api.jsonl")
    server = StudioApiServer(("127.0.0.1", 0), BoomPipeline(logger))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        host, port = server.server_address[:2]
        with httpx.Client(base_url=f"http://{host}:{port}", timeout=5.0,
                          trust_env=False) as client:
            response = client.post("/tools/studio_list_apps")
            assert response.status_code == 500
            assert response.json()["ok"] is False
            assert "falha inesperada" not in response.text
            # a conexão continua utilizável depois do erro
            assert client.post("/tools/studio_nope").status_code == 404
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)

    events = read_events(tmp_path / "api.jsonl")
    assert events[-1]["event"] == "api_error"
    assert events[-1]["error"] == "RuntimeError"

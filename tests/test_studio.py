import ast
import json
from pathlib import Path
import httpx
import pytest
from pydantic import ValidationError
from agents.base_agent import RunContext, ToolBlocked
from agents.central.contracts import RouteDecision
from agents.central.router import SYSTEM, Router
from agents.studio.agent import StudioAgent
from agents.studio.client import (MAX_RESPONSE_BYTES, StudioClient, StudioError,
                                  load_studio_hosts, parse_base_url)
from agents.studio.contracts import StudioRequest
from agents.studio.gate import check_request
from agents.studio.tools import build_studio_tools
from core.hard_gate import assert_no_execution_tool
from core.llm_client import FakeLLM
from core.tool_monitor import KNOWN_TOOLS, ToolMonitor
from pipelines.central_wiring import build_central
from pipelines.studio_pipeline import StudioPipeline, new_context

PROJECT = "123e4567-e89b-42d3-a456-426614174000"
HOSTS = frozenset({"127.0.0.1", "localhost", "::1"})
STUDIO_TOOLS = {"studio_health", "studio_list_apps", "studio_create_app",
                "studio_app_status", "studio_validate_app", "studio_send_message",
                "studio_fix_app", "studio_fix_validation", "studio_rebuild_app",
                "studio_retry_app", "studio_import_site", "studio_import_github",
                "studio_import_app", "studio_list_versions", "studio_restore_version"}


def make_client(handler, base="http://127.0.0.1:8787"):
    return StudioClient(base, HOSTS, timeout=2.0, transport=httpx.MockTransport(handler))


def routes_handler(routes, calls=None):
    def handler(request):
        if calls is not None:
            calls.append({"method": request.method, "path": request.url.path,
                          "query": request.url.query.decode(), "body": request.content})
        key = (request.method, request.url.path)
        if key not in routes:
            return httpx.Response(404, json={"error": "não encontrado"})
        value = routes[key]
        return value(request) if callable(value) else httpx.Response(200, json=value)
    return handler


def pipe(env, handler):
    return StudioPipeline(make_client(handler), env.memory, env.perms, env.logger, env.monitor)


# --- URL e hosts ---------------------------------------------------------
@pytest.mark.parametrize("url", ["http://127.0.0.1:8787", "http://localhost:8787",
                                 "http://127.0.0.1", "http://[::1]:8787"])
def test_parse_base_url_accepts_loopback(url):
    assert parse_base_url(url, HOSTS).startswith("http://")


@pytest.mark.parametrize("url", ["https://127.0.0.1:8787", "http://example.com",
                                 "http://user:pw@127.0.0.1:8787", "http://127.0.0.1:8787/api",
                                 "http://127.0.0.1:8787/?x=1", "http://127.0.0.1:8787/#x",
                                 "", "ftp://127.0.0.1", "http://127.0.0.1:99999999"])
def test_parse_base_url_rejects_everything_else(url):
    with pytest.raises(StudioError):
        parse_base_url(url, HOSTS)


def test_hosts_file_fails_closed_and_ignores_comments(tmp_path):
    assert load_studio_hosts(tmp_path / "nao_existe.txt") == frozenset()
    path = tmp_path / "hosts.txt"
    path.write_text("# comentário\n127.0.0.1\n\n localhost \n", encoding="utf-8")
    assert load_studio_hosts(path) == frozenset({"127.0.0.1", "localhost"})


# --- gate e contrato -----------------------------------------------------
@pytest.mark.parametrize("kw", [
    dict(action="create"),
    dict(action="create", prompt="http://evil.com faça um app"),
    dict(action="create", prompt="a" * 10, project_id=PROJECT),
    dict(action="status"),
    dict(action="status", prompt="a" * 10),
    dict(action="validate"),
    dict(action="list", project_id=PROJECT),
    dict(action="health", prompt="a" * 10),
    dict(action="create", prompt="a\x00" + "b" * 10),
    # mensagens e ações sobre projeto existente
    dict(action="messages", project_id=PROJECT),
    dict(action="messages", project_id=PROJECT, message="ok", url="https://example.com"),
    dict(action="messages", message="troque o azul por verde"),
    dict(action="fix"),
    dict(action="fix", project_id=PROJECT, prompt="a" * 10),
    dict(action="fix_validation", project_id=PROJECT, kind="site"),
    dict(action="rebuild", project_id=PROJECT, message="recompilar"),
    dict(action="retry", url="https://example.com"),
    # histórico de versões
    dict(action="restore"),
    dict(action="restore", project_id=PROJECT),
    dict(action="restore", version=2),
    dict(action="restore", project_id=PROJECT, version=2, message="ok"),
    dict(action="restore", project_id=PROJECT, version=2, kind="site"),
    dict(action="versions"),
    dict(action="versions", project_id=PROJECT, version=2),
    dict(action="status", project_id=PROJECT, version=2),
    # importação
    dict(action="import"),
    dict(action="import", kind="site"),
    dict(action="import", kind="site", url="http://127.0.0.1:8787/api/health"),
    dict(action="import", kind="site", url="http://localhost/x"),
    dict(action="import", kind="site", url="http://servidor.local/x"),
    dict(action="import", kind="site", url="http://10.0.0.1/x"),
    dict(action="import", kind="site", url="http://192.168.0.1/x"),
    dict(action="import", kind="site", url="http://[::1]/x"),
    dict(action="import", kind="site", url="https://user:pw@example.com"),
    dict(action="import", kind="site", url="ftp://example.com/x"),
    dict(action="import", kind="site", url="https://example.com/x#frag"),
    dict(action="import", kind="site", url="https://example.com", project_id=PROJECT),
    dict(action="import", kind="github", url="https://gitlab.com/a/b"),
    dict(action="import", kind="github", url="https://github.com/a/b", prompt="a" * 10),
    dict(action="import", kind="app"),
    dict(action="import", kind="app", project_id=PROJECT, url="https://example.com"),
    dict(action="import", kind="app", project_id=PROJECT, prompt="a" * 10),
])
def test_gate_rejects_invalid_combinations(kw):
    assert check_request(StudioRequest(**kw))


@pytest.mark.parametrize("kw", [dict(action="health"), dict(action="list"),
                                dict(action="create", prompt="loja de café"),
                                dict(action="status", project_id=PROJECT),
                                dict(action="validate", project_id=PROJECT),
                                dict(action="messages", project_id=PROJECT,
                                     message="troque o azul por verde"),
                                dict(action="fix", project_id=PROJECT),
                                dict(action="fix_validation", project_id=PROJECT),
                                dict(action="rebuild", project_id=PROJECT),
                                dict(action="retry", project_id=PROJECT),
                                dict(action="versions", project_id=PROJECT),
                                dict(action="restore", project_id=PROJECT, version=2),
                                dict(action="import", kind="site", url="https://example.com"),
                                dict(action="import", kind="site", url="https://example.com",
                                     prompt="inspirado neste layout"),
                                dict(action="import", kind="github",
                                     url="https://github.com/Budluk/plataforma-agentes"),
                                dict(action="import", kind="app", project_id=PROJECT)])
def test_gate_accepts_only_the_expected_shapes(kw):
    assert check_request(StudioRequest(**kw)) == []


@pytest.mark.parametrize("kw", [dict(action="create", prompt="curto"),
                                dict(action="status", project_id="abc"),
                                dict(action="messages", project_id=PROJECT, message="x"),
                                dict(action="restore", project_id=PROJECT, version=0),
                                dict(action="restore", project_id=PROJECT, version=1_000_001),
                                dict(action="import", kind="zip", url="https://example.com"),
                                dict(action="executar")])
def test_contract_rejects_before_any_http(kw):
    with pytest.raises(ValidationError):
        StudioRequest(**kw)


# --- cliente -------------------------------------------------------------
def test_health_ok_and_sanitized(env):
    calls = []
    handler = routes_handler({("GET", "/api/health"): {
        "ok": True, "name": "CloneStudio AI", "version": "0.2.0",
        "providers": ["freellmapi"], "internal": "SEGREDO"}}, calls)
    result = pipe(env, handler).health()
    assert result.ok and result.data == {"ok": True, "name": "CloneStudio AI",
                                         "version": "0.2.0", "providers": ["freellmapi"]}
    assert calls[0]["method"] == "GET" and calls[0]["path"] == "/api/health"


def test_health_requires_ok_true(env):
    result = pipe(env, routes_handler({("GET", "/api/health"): {"ok": False}})).health()
    assert not result.ok and "saúde" in result.reasons[0]


def test_create_sends_only_the_prompt_and_hides_code_logs(env):
    calls = []
    project = {
        "id": PROJECT, "name": "Loja", "status": "generating", "stage": "Na fila",
        "fileCount": 0, "updatedAt": "2026-01-01T00:00:00.000Z",
        "previewUrl": "http://127.0.0.1:8788/preview/x/",
        "buildLog": "SEGREDO", "files": {"src/App.tsx": "SEGREDO"},
        "messages": [{"content": "SEGREDO"}], "prompt": "SEGREDO",
    }
    handler = routes_handler({("GET", "/api/health"): {"ok": True},
                              ("POST", "/api/projects"): {"project": project}}, calls)
    result = pipe(env, handler).create("uma loja de café com carrinho")
    assert result.ok and result.data["id"] == PROJECT
    assert "SEGREDO" not in json.dumps(result.data)
    assert [c["path"] for c in calls] == ["/api/health", "/api/projects"]
    assert json.loads(calls[1]["body"]) == {"prompt": "uma loja de café com carrinho"}


def test_status_asks_without_files_and_sanitizes_validation(env):
    calls = []
    project = {"id": PROJECT, "name": "Loja", "status": "ready", "stage": "Pronto",
               "fileCount": 4, "updatedAt": "2026-01-01", "error": "",
               "previewUrl": "http://127.0.0.1:8788/preview/x/",
               "validation": {"status": "issues", "blank": False, "navigationError": "",
                              "counts": {"console": 2, "page": 0, "requests": 1, "http": 0,
                                         "images": 0, "total": 3},
                              "consoleErrors": [{"text": "SEGREDO"}], "instruction": "SEGREDO"},
               "buildLog": "SEGREDO", "files": {"src/App.tsx": "SEGREDO"}}
    handler = routes_handler({("GET", "/api/health"): {"ok": True},
                              ("GET", f"/api/projects/{PROJECT}"): {"project": project}}, calls)
    result = pipe(env, handler).status(PROJECT)
    assert result.ok and calls[1]["query"] == "files=0"
    assert result.data["validation"]["counts"]["console"] == 2
    assert "SEGREDO" not in json.dumps(result.data)


def test_validate_returns_only_counts(env):
    project = {"id": PROJECT, "name": "Loja", "status": "ready", "stage": "Pronto"}
    handler = routes_handler({
        ("GET", "/api/health"): {"ok": True},
        ("POST", f"/api/projects/{PROJECT}/validate"): {
            "project": project,
            "validation": {"status": "issues", "blank": False, "navigationError": "",
                           "counts": {"console": 1, "page": 0, "requests": 0, "http": 0,
                                      "images": 0, "total": 1},
                           "consoleErrors": [{"text": "SEGREDO"}]},
        },
    })
    result = pipe(env, handler).validate(PROJECT)
    assert result.ok and result.data["validation"]["counts"]["total"] == 1
    assert "SEGREDO" not in json.dumps(result.data)


def test_list_caps_at_twenty(env):
    projects = [{"id": PROJECT, "name": f"app {i}", "status": "ready"} for i in range(25)]
    result = pipe(env, routes_handler({("GET", "/api/health"): {"ok": True},
                                       ("GET", "/api/projects"): {"projects": projects}})).list_apps()
    assert result.ok and result.data["count"] == 25 and len(result.data["projects"]) == 20


def test_versions_returns_sanitized_history(env):
    calls = []
    payload = {
        "currentVersion": 2,
        "versions": [
            {"version": 2, "label": "Alteração por chat", "kind": "chat",
             "createdAt": "2026-01-02T00:00:00.000Z", "fileCount": 3,
             "hash": "SEGREDO", "messageId": "SEGREDO", "files": {"src/App.tsx": "SEGREDO"}},
            {"version": 1, "label": "Geração inicial", "kind": "initial",
             "createdAt": "2026-01-01T00:00:00.000Z", "fileCount": 3},
            {"version": 0, "label": "inválida"},
            {"version": "x"},
            "lixo",
        ],
    }
    handler = routes_handler({
        ("GET", "/api/health"): {"ok": True},
        ("GET", f"/api/projects/{PROJECT}/versions"): payload,
    }, calls)
    result = pipe(env, handler).versions(PROJECT)
    assert result.ok and result.data["currentVersion"] == 2 and result.data["count"] == 2
    assert [v["version"] for v in result.data["versions"]] == [2, 1]
    assert "SEGREDO" not in json.dumps(result.data)
    assert (calls[1]["method"], calls[1]["path"]) == ("GET", f"/api/projects/{PROJECT}/versions")


def test_versions_without_a_list_fails_closed(env):
    result = pipe(env, routes_handler({
        ("GET", "/api/health"): {"ok": True},
        ("GET", f"/api/projects/{PROJECT}/versions"): {"currentVersion": 0},
    })).versions(PROJECT)
    assert not result.ok and "versões" in result.reasons[0]


def test_restore_posts_only_the_version_and_hides_the_code(env):
    calls = []
    handler = routes_handler({
        ("GET", "/api/health"): {"ok": True},
        ("POST", f"/api/projects/{PROJECT}/restore"): {
            "project": project_payload(status="generating", currentVersion=1),
            "version": {"version": 1, "label": "Geração inicial", "kind": "initial",
                        "createdAt": "2026-01-01T00:00:00.000Z", "fileCount": 3,
                        "hash": "SEGREDO"},
        },
    }, calls)
    result = pipe(env, handler).restore(PROJECT, 1)
    assert result.ok and result.data["restoredVersion"] == 1
    assert json.loads(calls[1]["body"]) == {"version": 1}
    assert "SEGREDO" not in json.dumps(result.data)


def test_redirect_is_refused(env):
    def handler(request):
        return httpx.Response(302, headers={"location": "http://evil.com"})
    result = pipe(env, handler).health()
    assert not result.ok and "redirecionamento" in result.reasons[0]


def test_oversized_response_is_refused(env):
    def handler(request):
        return httpx.Response(200, content=b"a" * (MAX_RESPONSE_BYTES + 1))
    result = pipe(env, handler).health()
    assert not result.ok and "grande demais" in result.reasons[0]


def test_http_error_does_not_leak_the_body(env):
    def handler(request):
        return httpx.Response(500, json={"error": "SEGREDO"})
    result = pipe(env, handler).health()
    assert not result.ok and "500" in result.reasons[0] and "SEGREDO" not in result.reasons[0]


def test_non_json_response_is_refused(env):
    def handler(request):
        return httpx.Response(200, content=b"<html>nao e json</html>")
    result = pipe(env, handler).health()
    assert not result.ok and "JSON" in result.reasons[0]


def test_network_error_becomes_rejection(env):
    def handler(request):
        raise httpx.ConnectTimeout("timeout")
    result = pipe(env, handler).health()
    assert not result.ok and "ConnectTimeout" in result.reasons[0]


# --- supervisão: gate, monitor e permissões ------------------------------
def test_create_with_url_is_rejected_without_any_http(env):
    calls = []
    result = pipe(env, routes_handler({}, calls)).create("http://evil.com clone esta página")
    assert not result.ok and "URL" in result.reasons[0] and calls == []


def test_short_prompt_is_rejected_without_any_http(env):
    calls = []
    assert not pipe(env, routes_handler({}, calls)).create("curto").ok
    assert calls == []


def test_monitor_blocks_dangerous_prompt_before_the_post(env):
    calls = []
    handler = routes_handler({("GET", "/api/health"): {"ok": True}}, calls)
    result = pipe(env, handler).create("crie um app $(rm -rf /) com login")
    assert not result.ok and "ToolBlocked" in result.reasons[0]
    assert [c["method"] for c in calls] == ["GET"]


def test_permissions_block_the_tool_when_capability_is_missing(env):
    import sqlite3
    from contextlib import closing
    with closing(sqlite3.connect(env.db)) as con:
        con.execute("DELETE FROM capabilities WHERE agent='studio_agent' AND tool='studio_create_app'")
        con.commit()
    calls = []
    handler = routes_handler({("GET", "/api/health"): {"ok": True}}, calls)
    result = pipe(env, handler).create("uma loja de café com carrinho")
    assert not result.ok and "permiss" in result.reasons[0]
    assert [c["method"] for c in calls] == ["GET"]


@pytest.mark.parametrize("tool,kwargs", [
    ("studio_list_apps", {}),
    ("studio_create_app", {"prompt": "uma loja de café com carrinho"}),
    ("studio_app_status", {"project_id": PROJECT}),
    ("studio_validate_app", {"project_id": PROJECT}),
    ("studio_send_message", {"project_id": PROJECT, "content": "troque o azul"}),
    ("studio_fix_app", {"project_id": PROJECT}),
    ("studio_fix_validation", {"project_id": PROJECT}),
    ("studio_rebuild_app", {"project_id": PROJECT}),
    ("studio_retry_app", {"project_id": PROJECT}),
    ("studio_import_site", {"url": "https://example.com"}),
    ("studio_import_github", {"url": "https://github.com/Budluk/plataforma-agentes"}),
    ("studio_import_app", {"project_id": PROJECT}),
    ("studio_list_versions", {"project_id": PROJECT}),
    ("studio_restore_version", {"project_id": PROJECT, "version": 1}),
])
def test_every_studio_tool_requires_health_in_the_same_run(env, tool, kwargs):
    ctx = RunContext(run_id="t1")
    agent = StudioAgent(tools=build_studio_tools(make_client(routes_handler({}))),
                        monitor=env.monitor, permissions=env.perms, logger=env.logger, ctx=ctx)
    with pytest.raises(ToolBlocked) as exc:
        agent.call_tool(tool, **kwargs)
    assert "studio_health" in str(exc.value)


def test_studio_capabilities_are_exclusive(env):
    granted = {tool for tool in KNOWN_TOOLS if env.perms.is_allowed("studio_agent", tool)}
    assert granted == STUDIO_TOOLS
    for other in ("central", "analyst", "dev_agent", "research_agent", "pipeline"):
        assert not any(env.perms.is_allowed(other, tool) for tool in STUDIO_TOOLS)


def test_studio_tool_names_pass_the_execution_veto():
    for tool in STUDIO_TOOLS:
        assert_no_execution_tool(tool)


# --- agente central ------------------------------------------------------
def test_route_decision_accepts_studio():
    assert RouteDecision(area="studio").area == "studio"


def test_router_system_mentions_studio():
    assert "studio" in SYSTEM


def test_run_maps_text_to_the_closed_actions(env):
    calls = []
    routes = {
        ("GET", "/api/health"): {"ok": True},
        ("GET", "/api/projects"): {"projects": []},
        ("POST", "/api/projects"): {"project": {"id": PROJECT, "name": "Novo", "status": "generating"}},
        ("GET", f"/api/projects/{PROJECT}"): {"project": {"id": PROJECT, "name": "Novo", "status": "ready"}},
        ("POST", f"/api/projects/{PROJECT}/validate"): {
            "project": {"id": PROJECT, "name": "Novo", "status": "ready"},
            "validation": {"status": "ok", "blank": False, "navigationError": "",
                           "counts": {"console": 0, "page": 0, "requests": 0, "http": 0,
                                      "images": 0, "total": 0}}},
    }
    pipeline = pipe(env, routes_handler(routes, calls))

    assert pipeline.run("listar meus apps").ok
    assert (calls[-1]["method"], calls[-1]["path"]) == ("GET", "/api/projects")
    assert pipeline.run(f"status {PROJECT}").ok
    assert (calls[-1]["method"], calls[-1]["path"]) == ("GET", f"/api/projects/{PROJECT}")
    assert pipeline.run(f"validar {PROJECT}").ok
    assert (calls[-1]["method"], calls[-1]["path"]) == ("POST", f"/api/projects/{PROJECT}/validate")
    assert pipeline.run("crie um app de notas").ok
    assert (calls[-1]["method"], calls[-1]["path"]) == ("POST", "/api/projects")
    assert pipeline.run("status").ok
    assert (calls[-1]["method"], calls[-1]["path"]) == ("GET", "/api/health")


def test_empty_run_is_rejected(env):
    assert not pipe(env, routes_handler({})).run("   ").ok


def test_central_dispatches_studio_and_reports_the_area(env, tmp_path):
    calls = []
    handler = routes_handler({
        ("GET", "/api/health"): {"ok": True},
        ("POST", "/api/projects"): {"project": {"id": PROJECT, "name": "Notas",
                                                "status": "generating", "stage": "Na fila"}},
    }, calls)
    central = build_central(
        router_llm=FakeLLM(json.dumps({"area": "studio", "reason": "criar app"})),
        area_llm=FakeLLM("{}"), db=env.db, data_dir=tmp_path,
        allowed_domains=frozenset(), allowed_imports=frozenset(), fetcher=None,
        studio_client=make_client(handler), logger=env.logger)
    result = central.handle("crie um app de notas com etiquetas")
    assert (result.area, result.dispatched, result.ok) == ("studio", True, True)
    assert result.data["id"] == PROJECT
    assert json.loads(calls[-1]["body"]) == {"prompt": "crie um app de notas com etiquetas"}


def test_central_without_studio_client_fails_closed(env, tmp_path):
    central = build_central(
        router_llm=FakeLLM(json.dumps({"area": "studio", "reason": "criar app"})),
        area_llm=FakeLLM("{}"), db=env.db, data_dir=tmp_path,
        allowed_domains=frozenset(), allowed_imports=frozenset(), fetcher=None,
        logger=env.logger)
    result = central.handle("crie um app de notas")
    assert not result.dispatched and not result.ok and "sem handler" in result.reasons[0]


# --- higiene: a área não pode executar nada ------------------------------
def test_studio_modules_never_execute_or_spawn():
    root = Path(__file__).resolve().parent.parent
    files = list((root / "agents" / "studio").glob("*.py")) + [root / "pipelines" / "studio_pipeline.py"]
    banned_modules = {"subprocess", "os", "importlib", "runpy", "ctypes", "multiprocessing",
                      "pty", "shutil"}
    for path in files:
        tree = ast.parse(path.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                assert not {a.name.split(".")[0] for a in node.names} & banned_modules, path.name
            elif isinstance(node, ast.ImportFrom):
                assert (node.module or "").split(".")[0] not in banned_modules, path.name
            elif isinstance(node, ast.Call):
                fn = node.func
                name = fn.id if isinstance(fn, ast.Name) else ""
                attr = fn.attr if isinstance(fn, ast.Attribute) else ""
                assert name not in {"eval", "exec", "compile", "__import__"}, f"{path.name}: {name}"
                assert attr not in {"system", "popen", "eval", "exec"}, f"{path.name}: {attr}"


# --- ações sobre projeto existente (mensagens, correções, build) ----------
def project_payload(**extra):
    base = {
        "id": PROJECT, "name": "Loja", "status": "generating", "stage": "Na fila",
        "fileCount": 0, "updatedAt": "2026-01-01T00:00:00.000Z",
        "previewUrl": "http://127.0.0.1:8788/preview/x/",
        "buildLog": "SEGREDO", "files": {"src/App.tsx": "SEGREDO"},
        "messages": [{"content": "SEGREDO"}], "prompt": "SEGREDO",
    }
    base.update(extra)
    return base


@pytest.mark.parametrize("method,route", [("fix", "fix"), ("fix_validation", "fix-validation"),
                                          ("rebuild", "rebuild"), ("retry", "retry")])
def test_project_actions_hit_the_right_route(env, method, route):
    calls = []
    handler = routes_handler({
        ("GET", "/api/health"): {"ok": True},
        ("POST", f"/api/projects/{PROJECT}/{route}"): {"project": project_payload(status="ready")},
    }, calls)
    result = getattr(pipe(env, handler), method)(PROJECT)
    assert result.ok and result.data["status"] == "ready"
    assert "SEGREDO" not in json.dumps(result.data)
    assert (calls[1]["method"], calls[1]["path"]) == ("POST", f"/api/projects/{PROJECT}/{route}")


def test_message_posts_only_the_content(env):
    calls = []
    handler = routes_handler({
        ("GET", "/api/health"): {"ok": True},
        ("POST", f"/api/projects/{PROJECT}/messages"): {"project": project_payload()},
    }, calls)
    result = pipe(env, handler).message(PROJECT, "troque o azul por verde")
    assert result.ok and result.data["status"] == "generating"
    assert json.loads(calls[1]["body"]) == {"content": "troque o azul por verde"}
    assert "SEGREDO" not in json.dumps(result.data)


def test_conflict_is_reported_without_leaking_the_body(env):
    def handler(request):
        if request.url.path == "/api/health":
            return httpx.Response(200, json={"ok": True})
        return httpx.Response(409, json={"error": "SEGREDO"})
    result = pipe(env, handler).retry(PROJECT)
    assert not result.ok and "409" in result.reasons[0] and "SEGREDO" not in result.reasons[0]


# --- importação -----------------------------------------------------------
@pytest.mark.parametrize("call,payload", [
    (lambda p: p.import_site("https://example.com"),
     {"kind": "site", "url": "https://example.com"}),
    (lambda p: p.import_site("https://example.com", "inspirado neste layout"),
     {"kind": "site", "url": "https://example.com", "prompt": "inspirado neste layout"}),
    (lambda p: p.import_github("https://github.com/Budluk/plataforma-agentes"),
     {"kind": "github", "url": "https://github.com/Budluk/plataforma-agentes"}),
    (lambda p: p.import_app(PROJECT), {"kind": "app", "projectId": PROJECT}),
])
def test_import_posts_the_expected_payload(env, call, payload):
    calls = []
    handler = routes_handler({
        ("GET", "/api/health"): {"ok": True},
        ("POST", "/api/import"): {"kind": payload["kind"], "project": project_payload()},
    }, calls)
    result = call(pipe(env, handler))
    assert result.ok and result.data["kind"] == payload["kind"]
    assert json.loads(calls[1]["body"]) == payload
    assert "SEGREDO" not in json.dumps(result.data)


def test_import_of_local_url_is_rejected_without_any_http(env):
    calls = []
    result = pipe(env, routes_handler({}, calls)).import_site("http://127.0.0.1:8787/api/health")
    assert not result.ok and "local" in result.reasons[0] and calls == []


def test_import_of_cloud_metadata_is_rejected_without_any_http(env):
    calls = []
    result = pipe(env, routes_handler({}, calls)).import_site("http://169.254.169.254/latest/meta-data")
    assert not result.ok and calls == []


def test_import_github_rejects_other_hosts_without_http(env):
    calls = []
    result = pipe(env, routes_handler({}, calls)).import_github("https://gitlab.com/a/b")
    assert not result.ok and "github.com" in result.reasons[0] and calls == []


def test_import_rejects_a_control_character_without_http(env):
    calls = []
    result = pipe(env, routes_handler({}, calls)).import_site("https://example.com/\x00x")
    assert not result.ok and calls == []


# --- texto livre do agente central ---------------------------------------
def test_run_maps_project_actions_by_keyword(env):
    calls = []
    routes = {("GET", "/api/health"): {"ok": True}}
    for route in ("fix", "fix-validation", "rebuild", "retry", "messages"):
        routes[("POST", f"/api/projects/{PROJECT}/{route}")] = {"project": project_payload()}
    pipeline = pipe(env, routes_handler(routes, calls))
    cases = [(f"corrigir {PROJECT}", "fix"),
             (f"corrigir a validação {PROJECT}", "fix-validation"),
             (f"recompilar {PROJECT}", "rebuild"),
             (f"tentar de novo {PROJECT}", "retry"),
             (f"mensagem {PROJECT} troque o azul por verde", "messages")]
    for text, route in cases:
        assert pipeline.run(text).ok, text
        assert calls[-1]["path"] == f"/api/projects/{PROJECT}/{route}"


def test_run_maps_versions_and_restore_text(env):
    calls = []
    routes = {
        ("GET", "/api/health"): {"ok": True},
        ("GET", f"/api/projects/{PROJECT}/versions"): {"currentVersion": 2, "versions": []},
        ("POST", f"/api/projects/{PROJECT}/restore"): {
            "project": project_payload(status="generating", currentVersion=1),
            "version": {"version": 1, "label": "Geração inicial", "kind": "initial"},
        },
    }
    pipeline = pipe(env, routes_handler(routes, calls))

    assert pipeline.run(f"versões {PROJECT}").ok
    assert (calls[-1]["method"], calls[-1]["path"]) == ("GET", f"/api/projects/{PROJECT}/versions")

    assert pipeline.run(f"restaurar a versão 2 {PROJECT}").ok
    assert (calls[-1]["method"], calls[-1]["path"]) == ("POST", f"/api/projects/{PROJECT}/restore")
    assert json.loads(calls[-1]["body"]) == {"version": 2}

    assert pipeline.run(f"voltar para a v1 {PROJECT}").ok
    assert json.loads(calls[-1]["body"]) == {"version": 1}


def test_run_restore_without_version_is_rejected_without_http(env):
    calls = []
    result = pipe(env, routes_handler({}, calls)).run(f"restaurar {PROJECT}")
    assert not result.ok and "versão" in result.reasons[0] and calls == []


def test_run_maps_import_text(env):
    calls = []
    handler = routes_handler({
        ("GET", "/api/health"): {"ok": True},
        ("POST", "/api/import"): {"kind": "site", "project": project_payload()},
    }, calls)
    pipeline = pipe(env, handler)
    assert pipeline.run("importar https://example.com").ok
    assert json.loads(calls[-1]["body"]) == {"kind": "site", "url": "https://example.com"}
    assert pipeline.run("importar https://github.com/Budluk/plataforma-agentes").ok
    assert json.loads(calls[-1]["body"]) == {"kind": "github",
                                            "url": "https://github.com/Budluk/plataforma-agentes"}


def test_run_import_without_url_is_rejected(env):
    calls = []
    assert not pipe(env, routes_handler({}, calls)).run("importar isto aqui").ok
    assert calls == []

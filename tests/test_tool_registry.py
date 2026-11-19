"""Invariantes do registro unico de ferramentas.

Garante que as estruturas derivadas (monitor, permissoes, API HTTP e fabricas
de ferramentas) continuam sendo apenas vistas de ``core.tool_registry``, sem
copias locais e sem divergencia de assinaturas.
"""
import inspect

from agents.dev.tools import build_dev_tools
from agents.finance.tools import build_tools as build_finance_tools
from agents.music.tools import build_music_tools
from agents.research.agent import build_research_tools
from agents.sales.funnel_agent import build_funnel_tools
from agents.sales.tools import build_sales_tools
from agents.studio.agent import StudioAgent
from agents.studio.contracts import ACTIONS, IMPORT_KINDS
from agents.studio.tools import build_studio_tools
from core.contracts import ToolCall
from core.permissions import SEED as PERMISSIONS_SEED
from core.tool_monitor import KNOWN_TOOLS, STUDIO_TOOLS, ToolMonitor
from core.tool_registry import (
    AGENT_TOOL,
    KNOWN_TOOLS as REGISTRY_KNOWN,
    REGISTRY,
    SEED as REGISTRY_SEED,
    STUDIO_ACTION_TOOL,
    STUDIO_AGENT_TOOL,
    STUDIO_AGENT_TOOLS,
    STUDIO_PARAM_ALIASES,
    STUDIO_TOOLS as REGISTRY_STUDIO,
    TOOL_SPECS,
)
from scripts.studio_api import TOOL_SPECS as API_TOOL_SPECS


class RecordingClient:
    """Registra metodo e argumentos sem fazer rede."""

    def __init__(self):
        self.calls = []

    def __getattr__(self, name):
        def record(*args):
            self.calls.append((name, args))
            return {"ok": True}
        return record


EXPECTED_SIGNATURES = {
    "studio_health": "() -> dict",
    "studio_list_apps": "() -> dict",
    "studio_create_app": "(prompt: str) -> dict",
    "studio_app_status": "(project_id: str) -> dict",
    "studio_validate_app": "(project_id: str) -> dict",
    "studio_send_message": "(project_id: str, content: str) -> dict",
    "studio_fix_app": "(project_id: str) -> dict",
    "studio_fix_validation": "(project_id: str) -> dict",
    "studio_rebuild_app": "(project_id: str) -> dict",
    "studio_retry_app": "(project_id: str) -> dict",
    "studio_list_versions": "(project_id: str) -> dict",
    "studio_restore_version": "(project_id: str, version: int) -> dict",
    "studio_import_site": "(url: str, prompt: str | None = None) -> dict",
    "studio_import_github": "(url: str) -> dict",
    "studio_import_app": "(project_id: str) -> dict",
    "studio_analyze_inspiration": "(url: str) -> dict",
    "studio_create_inspiration": "(inspiration_token: str, prompt: str | None = None) -> dict",
}

EXPECTED_TOOL_SPEC_ORDER = [
    "studio_health", "studio_list_apps", "studio_create_app", "studio_app_status",
    "studio_validate_app", "studio_send_message", "studio_fix_app",
    "studio_fix_validation", "studio_rebuild_app", "studio_retry_app",
    "studio_list_versions", "studio_restore_version", "studio_import_site",
    "studio_import_github", "studio_import_app", "studio_analyze_inspiration",
    "studio_create_inspiration",
]


def test_registry_is_the_only_source_of_tool_names():
    assert len(REGISTRY) == 31
    assert KNOWN_TOOLS == frozenset(REGISTRY)
    assert {tool for _, tool in REGISTRY_SEED} == set(REGISTRY)
    assert REGISTRY_SEED == [(spec.agent, name) for name, spec in REGISTRY.items()]
    assert len(set(REGISTRY_SEED)) == 31


def test_agent_tool_map_covers_all_non_studio_tools():
    non_studio = {name for name, spec in REGISTRY.items() if not spec.method}
    assert len(AGENT_TOOL) == 14
    assert len(set(AGENT_TOOL.values())) == 14
    assert set(AGENT_TOOL.values()) == non_studio
    for (agent, role), name in AGENT_TOOL.items():
        spec = REGISTRY[name]
        assert (spec.agent, spec.agent_method) == (agent, role)
        assert spec.action in ("", role)


def test_agent_factories_take_their_names_from_the_registry(tmp_path):
    assert set(build_sales_tools()) == {
        AGENT_TOOL[("sales_agent", action)] for action in ("margin", "price", "break_even")}
    assert set(build_music_tools()) == {
        AGENT_TOOL[("music_agent", action)]
        for action in ("identify_chord", "transpose", "tab")}
    assert set(build_funnel_tools()) == {AGENT_TOOL[("sales_agent", "funnel")]}
    assert set(build_research_tools(object())) == {AGENT_TOOL[("research_agent", "fetch")]}
    assert set(build_dev_tools({}, set(), tmp_path)) == {
        AGENT_TOOL[("dev_agent", role)] for role in ("analyze", "save")}
    assert set(build_finance_tools(None, tmp_path, {})) == {
        AGENT_TOOL[("analyst", "market_data")], AGENT_TOOL[("analyst", "note")],
        AGENT_TOOL[("risk_manager", "portfolio")], AGENT_TOOL[("pipeline", "alert")],
    }


def test_derived_collections_are_reexported_without_copies():
    assert KNOWN_TOOLS is REGISTRY_KNOWN
    assert STUDIO_TOOLS is REGISTRY_STUDIO
    assert PERMISSIONS_SEED is REGISTRY_SEED
    assert API_TOOL_SPECS is TOOL_SPECS


def test_studio_sets_keep_their_counts_and_meaning():
    assert len(STUDIO_TOOLS) == 16
    assert "studio_health" not in STUDIO_TOOLS
    assert len(STUDIO_AGENT_TOOLS) == 17
    assert STUDIO_AGENT_TOOLS == STUDIO_TOOLS | {"studio_health"}
    assert STUDIO_AGENT_TOOLS == set(TOOL_SPECS)
    assert set(TOOL_SPECS) == set(EXPECTED_SIGNATURES)
    assert len(TOOL_SPECS) == 17


def test_tool_spec_order_is_preserved_for_the_api_catalog():
    assert list(TOOL_SPECS) == EXPECTED_TOOL_SPEC_ORDER


def test_action_map_covers_the_closed_actions_and_import_kinds():
    expected = ({(action, "") for action in ACTIONS if action != "import"}
                | {("import", kind) for kind in IMPORT_KINDS})
    assert set(STUDIO_ACTION_TOOL) == expected
    assert len(STUDIO_ACTION_TOOL) == 17
    assert set(STUDIO_ACTION_TOOL.values()) == set(STUDIO_AGENT_TOOLS)
    for key, name in STUDIO_ACTION_TOOL.items():
        spec = TOOL_SPECS[name]
        assert (spec.action, spec.kind) == key
        assert spec.agent_method


def test_agent_method_map_is_bijective_and_complete():
    assert len(STUDIO_AGENT_TOOL) == 17
    assert len(set(STUDIO_AGENT_TOOL.values())) == 17
    assert set(STUDIO_AGENT_TOOL.values()) == set(STUDIO_AGENT_TOOLS)
    for method, name in STUDIO_AGENT_TOOL.items():
        assert TOOL_SPECS[name].agent_method == method
        assert hasattr(StudioAgent, method)


def test_studio_agent_signatures_come_from_the_registry():
    for method, name in STUDIO_AGENT_TOOL.items():
        spec = TOOL_SPECS[name]
        params = list(inspect.signature(getattr(StudioAgent, method)).parameters.values())
        assert [p.name for p in params] == [*spec.required, *spec.optional]
    assert str(inspect.signature(StudioAgent.send_message)) == (
        "(project_id: str, content: str) -> dict")
    assert str(inspect.signature(StudioAgent.import_site)) == (
        "(url: str, prompt: str | None = None) -> dict")


def test_request_field_alias_is_derived_from_the_spec():
    assert STUDIO_PARAM_ALIASES == {"content": "message"}
    assert TOOL_SPECS["studio_send_message"].param_aliases == (("content", "message"),)
    assert "content" in TOOL_SPECS["studio_send_message"].required


def test_sequence_requirements_come_from_the_registry():
    assert REGISTRY["emit_alert"].requires == ("read_portfolio",)
    assert REGISTRY["studio_health"].requires == ()
    for name in STUDIO_TOOLS:
        assert REGISTRY[name].requires == ("studio_health",)
    for name, spec in REGISTRY.items():
        for needed in spec.requires:
            assert needed in REGISTRY, f"{name} exige ferramenta desconhecida {needed}"


def test_monitor_applies_registry_requirements():
    monitor = ToolMonitor()
    health = ToolCall(agent="studio_agent", tool="studio_health")
    assert monitor.check(health, []).allowed

    list_apps = ToolCall(agent="studio_agent", tool="studio_list_apps")
    blocked = monitor.check(list_apps, [])
    assert not blocked.allowed
    assert blocked.reason == "studio_list_apps exige studio_health antes na mesma execução"
    assert monitor.check(list_apps, ["studio_health"]).allowed

    alert = ToolCall(agent="pipeline", tool="emit_alert")
    blocked = monitor.check(alert, [])
    assert not blocked.allowed
    assert blocked.reason == "emit_alert exige read_portfolio antes na mesma execução"
    assert monitor.check(alert, ["read_portfolio"]).allowed


def test_generated_studio_tools_keep_the_original_signatures():
    tools = build_studio_tools(RecordingClient())
    assert list(tools) == EXPECTED_TOOL_SPEC_ORDER
    for name, expected in EXPECTED_SIGNATURES.items():
        call = tools[name]
        assert call.__name__ == name
        assert str(inspect.signature(call)) == expected
        assert inspect.signature(call).return_annotation is dict


def test_generated_studio_tools_dispatch_to_the_recorded_client_method():
    client = RecordingClient()
    tools = build_studio_tools(client)
    params = {
        "studio_create_app": {"prompt": "uma loja"},
        "studio_send_message": {"project_id": "p1", "content": "mude o azul"},
        "studio_restore_version": {"project_id": "p1", "version": 3},
        "studio_import_site": {"url": "https://example.com", "prompt": "copy"},
        "studio_create_inspiration": {"inspiration_token": "tok", "prompt": "ideia"},
    }
    for name, arguments in params.items():
        assert tools[name](**arguments) == {"ok": True}
    assert client.calls == [
        ("create", ("uma loja",)),
        ("send_message", ("p1", "mude o azul")),
        ("restore", ("p1", 3)),
        ("import_site", ("https://example.com", "copy")),
        ("create_inspiration", ("tok", "ideia")),
    ]


def test_optional_parameters_remain_optional():
    client = RecordingClient()
    tools = build_studio_tools(client)
    tools["studio_import_site"]("https://example.com")
    tools["studio_create_inspiration"]("tok")
    assert client.calls == [
        ("import_site", ("https://example.com", None)),
        ("create_inspiration", ("tok", None)),
    ]


def test_generated_studio_tools_reject_wrong_parameters():
    tools = build_studio_tools(RecordingClient())
    # Como as closures originais, a fabrica valida nomes e obrigatoriedade;
    # tipos sao responsabilidade da API HTTP (_check_params), nao do callable.
    for name, arguments in (
        ("studio_create_app", {}),
        ("studio_create_app", {"prompt": "ok", "extra": 1}),
        ("studio_restore_version", {"project_id": "p1"}),
    ):
        try:
            tools[name](**arguments)
        except TypeError:
            continue
        raise AssertionError(f"{name} aceitou parametros invalidos: {arguments}")

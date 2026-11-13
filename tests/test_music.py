import json
import pytest
from pydantic import ValidationError
from agents.base_agent import RunContext, ToolBlocked
from agents.music import theory
from agents.music.agent import MusicAgent
from agents.music.contracts import MusicRequest
from agents.music.tools import build_music_tools
from core.llm_client import FakeLLM
from pipelines.music_pipeline import MusicPipeline, MusicRequestInvalid, parse_request


def pipe(env, resp="{}"):
    return MusicPipeline(FakeLLM(resp), env.memory, env.perms, env.logger, env.monitor)


def j(action, notes, semitones=0, **extra):
    return json.dumps({"action": action, "notes": notes, "semitones": semitones, **extra})


# --- teoria ---
def test_identify_major_minor_seventh():
    assert theory.identify_chord([60, 64, 67]) == "C"
    assert theory.identify_chord([57, 60, 64]) == "Am"
    assert theory.identify_chord([60, 64, 67, 71]) == "Cmaj7"
    assert theory.identify_chord([55, 59, 62, 65]) == "G7"


def test_identify_inversion_and_unknown():
    assert theory.identify_chord([64, 67, 72]) == "C"
    assert theory.identify_chord([60, 61, 62]) is None


def test_transpose_and_range():
    assert theory.transpose([60, 64, 67], 2) == [62, 66, 69]
    with pytest.raises(ValueError):
        theory.transpose([126], 5)


def test_tab_open_strings_and_unplayable():
    assert theory.to_guitar_tab([40]) == [{"note": "E2", "string": 6, "fret": 0}]
    assert theory.to_guitar_tab([64]) == [{"note": "E4", "string": 1, "fret": 0}]
    with pytest.raises(ValueError):
        theory.to_guitar_tab([20])


# --- contratos ---
@pytest.mark.parametrize("kw", [
    dict(action="tab", notes=[200]), dict(action="tab", notes=[]),
    dict(action="tab", notes=[-1]), dict(action="play", notes=[60]),
    dict(action="tab", notes=[60], semitones=99), dict(action="tab", notes=[60], shell="x"),
    dict(action="tab", notes=list(range(13))),
])
def test_invalid_requests_rejected(kw):
    with pytest.raises(ValidationError):
        MusicRequest(**kw)


@pytest.mark.parametrize("raw", ["", "[]", "{", "null", '{"action": "tab"}'])
def test_parse_request_rejects_malformed(raw):
    with pytest.raises(MusicRequestInvalid):
        parse_request(raw)


# --- pipeline ---
def test_pipeline_identify(env):
    res = pipe(env, j("identify_chord", [60, 64, 67])).run("x")
    assert res.ok and res.data == {"chord": "C"}


def test_pipeline_transpose(env):
    res = pipe(env, j("transpose", [60, 64, 67], 2)).run("x")
    assert res.ok and res.data["notes"] == [62, 66, 69]


def test_pipeline_tab(env):
    res = pipe(env, j("tab", [40, 45])).run("x")
    assert res.ok and res.data["tab"][0]["string"] == 6


def test_pipeline_rejects_unplayable_with_reason(env):
    res = pipe(env, j("tab", [20])).run("x")
    assert not res.ok and res.reasons
    assert any(e["event"] == "rejection" for e in env.events())


def test_pipeline_rejects_transpose_overflow(env):
    assert not pipe(env, j("transpose", [126], 5)).run("x").ok


def test_pipeline_rejects_junk_and_extra_field(env):
    assert not pipe(env, "lixo").run("x").ok
    assert not pipe(env, j("tab", [60], shell="rm -rf")).run("x").ok


def test_pipeline_calls_no_forbidden_tool(env):
    pipe(env, j("identify_chord", [60, 64, 67])).run("x")
    tools = {e.get("tool") for e in env.events() if e["event"] == "tool_call_attempt"}
    assert tools == {"identify_chord"}


# --- permissões e monitor valem para o novo agente ---
def make_agent(env):
    return MusicAgent(tools=build_music_tools(), monitor=env.monitor, permissions=env.perms,
                      logger=env.logger, ctx=RunContext(run_id="t"))


def test_music_agent_cannot_use_finance_tool(env):
    with pytest.raises(ToolBlocked) as exc:
        make_agent(env).call_tool("get_market_data", asset="PETR4")
    assert exc.value.head == "permissions"


def test_music_agent_execution_tool_vetoed(env):
    with pytest.raises(ToolBlocked) as exc:
        make_agent(env).call_tool("execution_order")
    assert exc.value.head == "veto"

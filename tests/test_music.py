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


def test_tab_is_a_chord_with_one_note_per_string():
    tab = theory.to_guitar_tab([60, 64, 67])
    assert [item["note"] for item in tab] == ["C4", "E4", "G4"]
    strings = [item["string"] for item in tab]
    assert len(set(strings)) == 3
    assert all(1 <= item["string"] <= 6 for item in tab)
    assert all(0 <= item["fret"] <= theory.MAX_FRET for item in tab)
    # Voicing compacto de C4 E4 G4 nas cordas 3, 2 e 1.
    assert [(item["string"], item["fret"]) for item in tab] == [(3, 5), (2, 5), (1, 3)]


def test_tab_keeps_order_and_handles_open_strings_and_sevenths():
    assert [(i["string"], i["fret"]) for i in theory.to_guitar_tab([40, 45, 50])] == [
        (6, 0), (5, 0), (4, 0)]
    seventh = theory.to_guitar_tab([60, 64, 67, 71])
    assert [i["note"] for i in seventh] == ["C4", "E4", "G4", "B4"]
    assert len({i["string"] for i in seventh}) == 4


def test_tab_accepts_duplicate_pitches_on_distinct_strings():
    tab = theory.to_guitar_tab([64, 64])
    assert [i["note"] for i in tab] == ["E4", "E4"]
    assert len({i["string"] for i in tab}) == 2


def test_tab_rejects_more_notes_than_strings():
    with pytest.raises(ValueError, match="excede as 6 cordas"):
        theory.to_guitar_tab(list(range(40, 40 + theory.MAX_CHORD_NOTES + 1)))


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


# --- gate ---
def test_gate_enforces_chord_size_for_tab_only():
    from agents.music.gate import check_request

    six = list(range(40, 40 + theory.MAX_CHORD_NOTES))
    seven = six + [64]
    assert check_request(MusicRequest(action="tab", notes=six)) == []
    reasons = check_request(MusicRequest(action="tab", notes=seven))
    assert any(f"{theory.MAX_CHORD_NOTES} cordas" in reason for reason in reasons)
    # O limite de acorde e especifico de tab; transpose/identify nao mudam.
    assert check_request(MusicRequest(action="identify_chord", notes=seven)) == []
    assert check_request(MusicRequest(action="transpose", notes=seven)) == []


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


def test_pipeline_rejects_chord_with_too_many_notes_before_the_tool(env):
    notes = list(range(40, 40 + theory.MAX_CHORD_NOTES + 1))
    res = pipe(env, j("tab", notes)).run("x")
    assert not res.ok and res.reasons
    assert any(f"{theory.MAX_CHORD_NOTES} cordas" in reason for reason in res.reasons)
    # O gate barra antes de qualquer ferramenta: nada de to_guitar_tab na auditoria.
    tools = {e.get("tool") for e in env.events() if e["event"] == "tool_call_attempt"}
    assert "to_guitar_tab" not in tools


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

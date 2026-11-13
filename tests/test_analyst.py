import json
import pytest
from agents.base_agent import RunContext
from agents.finance.analyst import Analyst, ProposalInvalid
from agents.finance.tools import build_tools
from core.llm_client import FakeLLM
from tests.test_base_agent import GOOD, OK, make


def test_propose_valid(env):
    p = make(Analyst, env, llm=FakeLLM(OK)).propose("PETR4")
    assert p.asset == "PETR4"
    assert any(e["event"] == "llm_request" for e in env.events())


def test_asset_outside_list_fails_before_llm(env):
    llm = FakeLLM(OK)
    with pytest.raises(ValueError):
        make(Analyst, env, llm=llm).propose("DOGE")
    assert llm.calls == 0


def test_invalid_json_rejected(env):
    with pytest.raises(ProposalInvalid):
        make(Analyst, env, llm=FakeLLM("não é json")).propose("PETR4")


def test_extra_field_rejected(env):
    d = json.loads(OK)
    d["execution"] = "buy"
    with pytest.raises(ProposalInvalid):
        make(Analyst, env, llm=FakeLLM(json.dumps(d))).propose("PETR4")


def test_fenced_json_accepted(env):
    assert make(Analyst, env, llm=FakeLLM("```json\n" + OK + "\n```")).propose("PETR4").asset == "PETR4"


def test_asset_mismatch_rejected(env):
    d = json.loads(OK)
    d["asset"] = "VALE3"
    with pytest.raises(ProposalInvalid):
        make(Analyst, env, llm=FakeLLM(json.dumps(d))).propose("PETR4")

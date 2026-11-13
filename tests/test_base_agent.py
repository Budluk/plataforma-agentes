import json
import pytest
from agents.base_agent import BaseAgent, RunContext, ToolBlocked
from agents.finance.analyst import Analyst
from agents.finance.tools import build_tools
from core.llm_client import FakeLLM, HttpLLMClient, LLMError

GOOD = {"equity": 10000.0, "daily_pnl_pct": -0.5, "equity_snapshot_consistent": True}
OK = json.dumps({"asset": "PETR4", "direction": "LONG", "entry_price": 38.0, "stop_price": 36.9,
                 "target_price": 41.5, "confidence": 0.7, "thesis": "t"})


def make(cls, env, **extra):
    tools = build_tools(env.memory, env.notes, GOOD)
    return cls(tools=tools, monitor=env.monitor, permissions=env.perms, logger=env.logger,
               ctx=RunContext(run_id="t"), **extra)


def test_call_tool_ok_and_logged_in_order(env):
    a = make(Analyst, env, llm=FakeLLM(OK))
    assert a.call_tool("get_market_data", asset="PETR4")["price"] == 38.0
    events = [e["event"] for e in env.events()]
    assert events.index("tool_call_attempt") < events.index("tool_ok")


def test_permission_denied(env):
    a = make(Analyst, env, llm=FakeLLM(OK))
    with pytest.raises(ToolBlocked) as exc:
        a.call_tool("read_portfolio")
    assert exc.value.head == "permissions"


def test_execution_tool_vetoed_and_logged(env):
    a = make(Analyst, env, llm=FakeLLM(OK))
    with pytest.raises(ToolBlocked) as exc:
        a.call_tool("execution_order", asset="PETR4")
    assert exc.value.head == "veto"
    assert any(e["event"] == "tool_blocked" and e["reason"] for e in env.events())


def test_call_tool_cannot_be_overridden():
    with pytest.raises(TypeError):
        class Evil(BaseAgent):
            def call_tool(self, tool, **params):
                return None


def test_llm_client_requires_key_and_model():
    with pytest.raises(LLMError):
        HttpLLMClient("groq", env={})
    with pytest.raises(LLMError):
        HttpLLMClient("groq", env={"GROQ_API_KEY": "x"})


def test_llm_client_repr_hides_key():
    c = HttpLLMClient("groq", env={"GROQ_API_KEY": "SEGREDO", "GROQ_MODEL": "m"})
    assert "SEGREDO" not in repr(c)

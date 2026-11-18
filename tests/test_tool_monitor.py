import pytest
from core.contracts import ToolCall
from core.tool_monitor import ToolMonitor


def call(tool, **params):
    return ToolCall(agent="analyst", tool=tool, params=params)


def test_allows_valid_call():
    assert ToolMonitor().check(call("get_market_data", asset="PETR4"), []).allowed


def test_blocks_unknown_tool():
    v = ToolMonitor().check(call("delete_everything"), [])
    assert not v.allowed and v.head == "registry"


def test_blocks_execution_tool():
    v = ToolMonitor().check(call("execution_order"), [])
    assert not v.allowed and v.head == "veto"


def test_allows_shell_like_text_in_free_text_fields():
    text = "use `cmd && echo $(date)`, veja ../relatorio.py e __import__('os')"
    v = ToolMonitor().check(call("write_research_note", text=text), [])
    assert v.allowed and v.head == "cascade"


def test_blocks_dangerous_path_param():
    v = ToolMonitor().check(call("save_code_file", filename="../../etc"), [])
    assert not v.allowed and v.head == "params"


def test_blocks_dangerous_path_in_nested_param():
    v = ToolMonitor().check(call("save_code_file", data={"a": ["ok", {"path": "..\\segredo"}]}), [])
    assert not v.allowed and v.head == "params"


@pytest.mark.parametrize("filename", [
    "/etc/passwd",
    "C:\\windows\\system32",
    "..%2f..%2fetc",
    "%252e%252e%252fetc",
    "．．／etc",
    "",
])
def test_rejects_obfuscated_or_absolute_paths(filename):
    v = ToolMonitor().check(call("save_code_file", filename=filename), [])
    assert not v.allowed and v.head == "params"


def test_accepts_plain_filename():
    assert ToolMonitor().check(call("save_code_file", filename="App.py"), []).allowed


def test_emit_alert_requires_read_portfolio():
    m = ToolMonitor()
    assert not m.check(call("emit_alert"), []).allowed
    assert m.check(call("emit_alert"), ["read_portfolio"]).allowed


def test_blocks_loop():
    v = ToolMonitor().check(call("get_market_data"), ["get_market_data", "get_market_data"])
    assert not v.allowed and v.head == "sequence"


def test_blocks_over_rate_limit():
    m = ToolMonitor(max_calls=3)
    v = m.check(call("get_market_data"), ["read_portfolio", "get_market_data", "read_portfolio"])
    assert not v.allowed and v.head == "rate"


def test_head_failure_blocks():
    m = ToolMonitor()

    def boom(c, h):
        raise RuntimeError("falha")

    m.heads = [("boom", boom)]
    v = m.check(call("get_market_data"), [])
    assert not v.allowed and v.head == "boom"

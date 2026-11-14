import ast
import json
from pathlib import Path
import pytest
from pydantic import ValidationError
from agents.base_agent import RunContext, ToolBlocked
from agents.dev.agent import DevAgent
from agents.dev.contracts import DevProposal, DevRequest
from agents.dev.gate import check_request
from agents.dev.static_check import analyze_source, load_allowed_imports
from agents.dev.tools import build_dev_tools
from core.llm_client import FakeLLM
from pipelines.dev_pipeline import DevPipeline, DevProposalInvalid, parse_proposal

ALLOWED = frozenset({"math", "collections", "typing", "dataclasses"})
GOOD = ('"""Fatorial."""\nimport math\n\n\ndef fatorial(n: int) -> int:\n'
        '    """Calcula n!."""\n    return math.factorial(n)\n')
TASK = "Escreva uma função de fatorial em Python"


def prop(code=GOOD, filename="fatorial.py", **extra):
    return json.dumps({"filename": filename, "code": code, "explanation": "ok", **extra})


def pipe(env, tmp_path, resp):
    return DevPipeline(FakeLLM(resp), ALLOWED, tmp_path / "out", env.memory, env.perms,
                       env.logger, env.monitor)


def saved_files(tmp_path):
    out = tmp_path / "out"
    return sorted(p.name for p in out.glob("*")) if out.exists() else []


# --- análise estática ---
CLEAN = '''"""Demo."""
import math
from collections import deque

class A:
    def __init__(self) -> None:
        self.q = deque()

class B(A):
    def __init__(self) -> None:
        super().__init__()
        self.nome = type(self).__name__

__all__ = ["B"]

if __name__ == "__main__":
    print(math.pi)
'''


def test_clean_code_passes_with_metrics():
    r = analyze_source(CLEAN, ALLOWED)
    assert r.ok and r.warnings == []
    assert r.metrics["classes"] == 2 and r.metrics["functions"] == 2 and r.metrics["has_main_guard"]
    assert r.metrics["imports"] == ["collections", "math"]


@pytest.mark.parametrize("code", [
    "import os", "import subprocess", "from os import path", "import os.path", "from . import x",
    "from math import *", "import socket", "import importlib", "import ctypes", "import pickle",
    "import asyncio", "eval('1')", "exec('x=1')", "compile('1','','eval')", "__import__('os')",
    "open('f')", "input()", "getattr(x,'a')", "setattr(x,'a',1)", "globals()", "locals()",
    "breakpoint()", "x = eval", "x = ().__class__", "x.__dict__",
    "def f(g):\n    return g.__globals__", "def f(): pass\nf.__code__", "frame.f_back", "gen.gi_frame",
    "x.mro()", "'{0.__class__}'.format(1)", "x = __builtins__",
    "().__class__.__bases__[0].__subclasses__()",
    "", "   \n", "def f(:\n    pass", "x = 'a\x00b'",
])
def test_dangerous_or_invalid_code_rejected(code):
    r = analyze_source(code, ALLOWED)
    assert not r.ok and r.findings


def test_size_and_depth_limits():
    assert not analyze_source("x = " + "(" * 3000 + "1" + ")" * 3000, ALLOWED).ok
    assert not analyze_source("x = 1\n" * 300, ALLOWED).ok
    assert not analyze_source("x = '" + "a" * 8001 + "'", ALLOWED).ok


def test_empty_import_list_blocks_all_imports():
    assert not analyze_source("import math", frozenset()).ok
    assert analyze_source("x = 1", frozenset()).ok


def test_warnings_are_not_blockers():
    r = analyze_source("def f(a=[]):\n    try:\n        pass\n    except:\n        pass\n"
                       "    while True:\n        pass\n", ALLOWED)
    assert r.ok and len(r.warnings) == 3
    assert analyze_source("while True:\n    break\n", ALLOWED).warnings == []


def test_load_allowed_imports(tmp_path):
    p = tmp_path / "i.txt"
    p.write_text("# c\n\nmath\nos.path\nre\n   json  \nlista maluca\n", encoding="utf-8")
    assert load_allowed_imports(p) == frozenset({"math", "re", "json"})
    assert load_allowed_imports(tmp_path / "nao.txt") == frozenset()


def test_shipped_import_list_has_no_dangerous_modules():
    allowed = load_allowed_imports(Path(__file__).resolve().parent.parent / "config" / "dev_allowed_imports.txt")
    assert "math" in allowed
    assert not allowed & {"os", "sys", "subprocess", "socket", "pathlib", "io", "importlib", "ctypes",
                          "pickle", "asyncio", "threading", "multiprocessing", "sqlite3", "shutil",
                          "urllib", "http", "logging", "builtins"}


# --- contratos e gate do pedido ---
@pytest.mark.parametrize("kw", [dict(action="run", task=TASK), dict(action="write", task="curta"),
                                dict(action="write", task=TASK, run=True),
                                dict(action="review", code="x" * 8001)])
def test_invalid_requests(kw):
    with pytest.raises(ValidationError):
        DevRequest(**kw)


@pytest.mark.parametrize("filename", ["../x.py", "a/b.py", "a\\b.py", "x.txt", "x.py ", "", ".py",
                                      "a" * 41 + ".py", "x.pyc", "x y.py"])
def test_invalid_filenames_rejected_by_contract(filename):
    with pytest.raises(ValidationError):
        DevProposal(filename=filename, code="x = 1")


def test_request_gate_fails_closed():
    assert check_request(DevRequest(action="review", code="   "))
    assert check_request(DevRequest(action="review", task=TASK, code="x = 1"))
    assert check_request(DevRequest(action="write", task=TASK, code="x = 1"))
    assert check_request(DevRequest(action="write", task=TASK)) == []


@pytest.mark.parametrize("raw", ["", "[]", "{", "null", '{"filename": "a.py"}'])
def test_parse_proposal_rejects_malformed(raw):
    with pytest.raises(DevProposalInvalid):
        parse_proposal(raw)


# --- pipeline: escrita ---
def test_write_saves_file_never_executed(env, tmp_path):
    res = pipe(env, tmp_path, prop()).write(TASK)
    assert res.ok and res.data["executed"] is False
    text = (tmp_path / "out" / "fatorial.py").read_text(encoding="utf-8")
    assert text.startswith("# GERADO POR LLM") and "math.factorial" in text


def test_write_never_overwrites(env, tmp_path):
    pipe(env, tmp_path, prop()).write(TASK)
    res = pipe(env, tmp_path, prop()).write(TASK)
    assert res.ok and res.data["filename"] == "fatorial_2.py"
    assert saved_files(tmp_path) == ["fatorial.py", "fatorial_2.py"]


@pytest.mark.parametrize("code", [
    "import os\nos.system('x')\n", "def f(x):\n    return eval(x)\n",
    "x = ().__class__.__bases__[0].__subclasses__()\n", "f = open('x', 'w')\n", "def f(:\n  pass\n",
])
def test_write_rejects_dangerous_code_and_saves_nothing(env, tmp_path, code):
    res = pipe(env, tmp_path, prop(code)).write(TASK)
    assert not res.ok and res.reasons[0].startswith("análise estática reprovou")
    assert saved_files(tmp_path) == []
    assert any(e["event"] == "rejection" for e in env.events())


@pytest.mark.parametrize("resp", ["lixo", prop(filename="../evil.py"), prop(run=True), prop(filename="x.txt")])
def test_write_rejects_bad_llm_output(env, tmp_path, resp):
    res = pipe(env, tmp_path, resp).write(TASK)
    assert not res.ok and saved_files(tmp_path) == []


@pytest.mark.parametrize("name", ["con.py", "NUL.py", "com1.py", "lpt9.py"])
def test_write_rejects_reserved_windows_names(env, tmp_path, name):
    res = pipe(env, tmp_path, prop(filename=name)).write(TASK)
    assert not res.ok and saved_files(tmp_path) == []


def test_write_rejects_short_task_before_calling_llm(env, tmp_path):
    llm = FakeLLM(prop())
    p = DevPipeline(llm, ALLOWED, tmp_path / "out", env.memory, env.perms, env.logger, env.monitor)
    assert not p.write("curta").ok and llm.calls == 0


def test_write_calls_only_analyze_then_save(env, tmp_path):
    pipe(env, tmp_path, prop()).write(TASK)
    tools = [e["tool"] for e in env.events() if e["event"] == "tool_call_attempt"]
    assert tools == ["analyze_code", "save_code_file"]


# --- pipeline: revisão ---
def test_review_reports_findings_without_llm(env, tmp_path):
    llm = FakeLLM("")
    p = DevPipeline(llm, ALLOWED, tmp_path / "out", env.memory, env.perms, env.logger, env.monitor)
    res = p.review("import os\ndef f(a=[]):\n    return getattr(a, 'x')\n")
    assert res.ok and res.data["approved"] is False and llm.calls == 0
    assert len(res.data["findings"]) == 2 and res.data["warnings"]
    assert saved_files(tmp_path) == []
    tools = {e["tool"] for e in env.events() if e["event"] == "tool_call_attempt"}
    assert tools == {"analyze_code"}


def test_review_clean_code_with_warning(env, tmp_path):
    res = pipe(env, tmp_path, "").review("def f(a=[]):\n    return len(a)\n")
    assert res.ok and res.data["approved"] is True and len(res.data["warnings"]) == 1


def test_review_rejects_empty_or_huge_input(env, tmp_path):
    assert not pipe(env, tmp_path, "").review("   ").ok
    assert not pipe(env, tmp_path, "").review("x" * 8001).ok


# --- ferramentas, veto e permissões ---
def test_save_tool_refuses_without_approval(tmp_path):
    tools = build_dev_tools({"code": GOOD, "approved": False}, ALLOWED, tmp_path / "out")
    with pytest.raises(ValueError):
        tools["save_code_file"]("a.py")
    assert not (tmp_path / "out").exists()


def test_analyze_tool_sets_approval_from_the_code(tmp_path):
    holder = {"code": "import os\n", "approved": True}
    build_dev_tools(holder, ALLOWED, tmp_path)["analyze_code"]()
    assert holder["approved"] is False


def make_agent(env, tmp_path, cls=DevAgent):
    tools = build_dev_tools({"code": GOOD, "approved": False}, ALLOWED, tmp_path / "out")
    return cls(tools=tools, monitor=env.monitor, permissions=env.perms, logger=env.logger,
               ctx=RunContext(run_id="t"))


@pytest.mark.parametrize("tool", ["run_code", "execute_code", "run_script", "eval_code", "shell_command",
                                  "pip_install", "git_push", "deploy", "execution_order", "launch_campaign"])
def test_execution_tools_vetoed(env, tmp_path, tool):
    with pytest.raises(ToolBlocked) as exc:
        make_agent(env, tmp_path).call_tool(tool)
    assert exc.value.head == "veto"


def test_dev_agent_cannot_use_other_areas_tools(env, tmp_path):
    with pytest.raises(ToolBlocked) as exc:
        make_agent(env, tmp_path).call_tool("fetch_page", url="https://en.wikipedia.org/wiki/X")
    assert exc.value.head == "permissions"


def test_other_agents_cannot_use_dev_tools(env, tmp_path):
    from agents.research.agent import ResearchAgent
    with pytest.raises(ToolBlocked) as exc:
        make_agent(env, tmp_path, ResearchAgent).call_tool("analyze_code")
    assert exc.value.head == "permissions"


# --- a plataforma nunca executa o código que recebe ---
def test_dev_modules_never_execute_or_spawn():
    root = Path(__file__).resolve().parent.parent
    files = list((root / "agents" / "dev").glob("*.py")) + [root / "pipelines" / "dev_pipeline.py",
                                                            root / "scripts" / "dev_cli.py"]
    banned_modules = {"subprocess", "os", "importlib", "runpy", "ctypes", "multiprocessing", "pty", "shutil"}
    banned_calls = {"eval", "exec", "compile", "__import__"}; banned_attr_calls = {"system", "popen", "eval", "exec"}
    for f in files:
        tree = ast.parse(f.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                assert not {a.name.split(".")[0] for a in node.names} & banned_modules, f.name
            elif isinstance(node, ast.ImportFrom):
                assert (node.module or "").split(".")[0] not in banned_modules, f.name
            elif isinstance(node, ast.Call):
                fn = node.func
                name = fn.id if isinstance(fn, ast.Name) else ""; attr = fn.attr if isinstance(fn, ast.Attribute) else ""
                assert name not in banned_calls and attr not in banned_attr_calls, f"{f.name}: chamada a {name or attr}"



def test_empty_code_rejected_by_contract_before_analysis(env, tmp_path):
    res = pipe(env, tmp_path, prop("")).write(TASK)
    assert not res.ok and saved_files(tmp_path) == []

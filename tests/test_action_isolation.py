import ast
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES = [p for d in ("core", "agents", "pipelines", "scripts") if (ROOT / d).exists() for p in (ROOT / d).rglob("*.py")]


def test_only_the_admin_layer_can_decide_approvals():
    allowed = {"control_store.py", "approvals_admin.py"}
    offenders = [p.name for p in SOURCES if "human_decide" in p.read_text(encoding="utf-8") and p.name not in allowed]
    assert offenders == []


def test_agents_and_pipelines_never_import_the_admin_layer():
    offenders = []
    for d in ("agents", "pipelines"):
        if not (ROOT / d).exists():
            continue
        for p in (ROOT / d).rglob("*.py"):
            tree = ast.parse(p.read_text(encoding="utf-8"))
            for node in ast.walk(tree):
                names = []
                if isinstance(node, ast.ImportFrom):
                    names = [node.module or ""] + [a.name for a in node.names]
                elif isinstance(node, ast.Import):
                    names = [a.name for a in node.names]
                if any("approvals_admin" in n for n in names):
                    offenders.append(p.name)
    assert offenders == []


def test_new_modules_never_execute_or_spawn_anything():
    banned_modules = {"subprocess", "importlib", "runpy", "ctypes", "multiprocessing", "pty", "shutil", "socket"}
    files = [ROOT / "core" / n for n in ("redact.py", "control_store.py", "actions.py", "approvals_admin.py")]
    files.append(ROOT / "scripts" / "approvals.py")
    for f in files:
        tree = ast.parse(f.read_text(encoding="utf-8"))
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                assert not {a.name.split(".")[0] for a in node.names} & banned_modules, f.name
            elif isinstance(node, ast.ImportFrom):
                assert (node.module or "").split(".")[0] not in banned_modules, f.name
            elif isinstance(node, ast.Call):
                fn = node.func
                name = fn.id if isinstance(fn, ast.Name) else ""
                attr = fn.attr if isinstance(fn, ast.Attribute) else ""
                assert name not in {"eval", "exec", "compile", "__import__"}, f"{f.name}: {name}"
                assert attr not in {"system", "popen", "eval", "exec"}, f"{f.name}: {attr}"


def test_the_literal_for_the_vetoed_order_tool_is_not_used_in_the_new_modules():
    needle = "execution" + "_order"
    for name in ("redact.py", "control_store.py", "actions.py", "approvals_admin.py"):
        assert needle not in (ROOT / "core" / name).read_text(encoding="utf-8")
    assert needle not in (ROOT / "scripts" / "approvals.py").read_text(encoding="utf-8")

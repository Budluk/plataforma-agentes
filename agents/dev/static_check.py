from __future__ import annotations
import ast
import re
from dataclasses import dataclass, field
from pathlib import Path

from agents.dev.contracts import MAX_CODE_CHARS, MAX_LINES

MAX_CHARS = MAX_CODE_CHARS
MAX_FINDINGS = 20
FORBIDDEN_NAMES = frozenset({
    "eval", "exec", "compile", "__import__", "open", "input", "breakpoint", "globals", "locals",
    "vars", "getattr", "setattr", "delattr", "exit", "quit", "help",
})
ALLOWED_DUNDER_NAMES = frozenset({"__name__", "__all__"})
ALLOWED_DUNDER_ATTRS = frozenset({"__init__", "__name__"})
FORBIDDEN_ATTRS = frozenset({
    "f_globals", "f_locals", "f_back", "f_builtins", "gi_frame", "gi_code", "cr_frame", "cr_code",
    "ag_frame", "tb_frame", "tb_next", "mro",
})
_FORMAT_TRICK = re.compile(r"\{[^{}]*__[^{}]*\}")


def _is_dunder(name: str) -> bool:
    return len(name) > 4 and name.startswith("__") and name.endswith("__")


def load_allowed_imports(path) -> frozenset[str]:
    p = Path(path)
    if not p.exists():
        return frozenset()  # sem arquivo = nenhum import permitido (falha fechada)
    out = set()
    for line in p.read_text(encoding="utf-8").splitlines():
        entry = line.strip()
        if not entry or entry.startswith("#"):
            continue
        if entry.isidentifier():
            out.add(entry)
    return frozenset(out)


@dataclass
class Report:
    findings: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)

    @property
    def ok(self) -> bool:
        return not self.findings


def analyze_source(code: str, allowed_imports) -> Report:
    if not code.strip():
        return Report(findings=["código vazio"])
    if "\x00" in code:
        return Report(findings=["código contém byte nulo"])
    if len(code) > MAX_CHARS:
        return Report(findings=[f"código excede {MAX_CHARS} caracteres"])
    lines = code.count("\n") + 1
    if lines > MAX_LINES:
        return Report(findings=[f"código excede {MAX_LINES} linhas"])
    try:
        tree = ast.parse(code)
    except SyntaxError as exc:
        return Report(findings=[f"sintaxe inválida (linha {exc.lineno})"])
    except (ValueError, RecursionError, MemoryError):
        return Report(findings=["código não pôde ser analisado (estrutura inválida ou profunda demais)"])

    findings: list[str] = []
    warnings: list[str] = []
    imports: set[str] = set()
    funcs = classes = 0
    main_guard = False

    def add(msg: str, node=None) -> None:
        loc = f" (linha {node.lineno})" if node is not None and hasattr(node, "lineno") else ""
        findings.append(msg + loc)

    try:
        for node in ast.walk(tree):
            if isinstance(node, ast.Import):
                for a in node.names:
                    top = a.name.split(".")[0]
                    imports.add(top)
                    if top not in allowed_imports:
                        add(f"import não permitido: {a.name}", node)
            elif isinstance(node, ast.ImportFrom):
                if node.level > 0:
                    add("import relativo não permitido", node)
                else:
                    top = (node.module or "").split(".")[0]
                    imports.add(top)
                    if top not in allowed_imports:
                        add(f"import não permitido: {node.module}", node)
                if any(a.name == "*" for a in node.names):
                    add("import com * não permitido", node)
            elif isinstance(node, ast.Name):
                if node.id in FORBIDDEN_NAMES:
                    add(f"uso de '{node.id}' não permitido", node)
                elif _is_dunder(node.id) and node.id not in ALLOWED_DUNDER_NAMES:
                    add(f"uso do nome '{node.id}' não permitido", node)
            elif isinstance(node, ast.Attribute):
                if (_is_dunder(node.attr) and node.attr not in ALLOWED_DUNDER_ATTRS) or node.attr in FORBIDDEN_ATTRS:
                    add(f"acesso ao atributo '{node.attr}' não permitido", node)
            elif isinstance(node, ast.Constant) and isinstance(node.value, str):
                if _FORMAT_TRICK.search(node.value):
                    add("string de formatação com '__' não permitida", node)
            elif isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                funcs += 1
                defaults = list(node.args.defaults) + [d for d in node.args.kw_defaults if d is not None]
                if any(isinstance(d, (ast.List, ast.Dict, ast.Set)) for d in defaults):
                    warnings.append(f"argumento padrão mutável em '{node.name}' (linha {node.lineno})")
            elif isinstance(node, ast.ClassDef):
                classes += 1
            elif isinstance(node, ast.ExceptHandler):
                if node.type is None:
                    warnings.append(f"'except:' sem tipo (linha {node.lineno})")
            elif isinstance(node, ast.While):
                if isinstance(node.test, ast.Constant) and node.test.value is True:
                    if not any(isinstance(n, ast.Break) for n in ast.walk(node)):
                        warnings.append(f"'while True' sem 'break' (linha {node.lineno})")
            elif isinstance(node, ast.Compare):
                if isinstance(node.left, ast.Name) and node.left.id == "__name__":
                    main_guard = True
    except RecursionError:
        return Report(findings=["código não pôde ser analisado (estrutura profunda demais)"])

    findings = list(dict.fromkeys(findings))[:MAX_FINDINGS]
    metrics = {"lines": lines, "functions": funcs, "classes": classes,
               "imports": sorted(imports), "has_main_guard": main_guard}
    return Report(findings=findings, warnings=list(dict.fromkeys(warnings)), metrics=metrics)

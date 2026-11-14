import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from agents.dev.static_check import load_allowed_imports
from core.llm_client import FakeLLM, HttpLLMClient, LLMError
from core.logger import JsonlLogger
from core.memory import Memory
from core.permissions import Permissions
from core.tool_monitor import ToolMonitor
from pipelines.dev_pipeline import DevPipeline
from scripts.init_db import create_all

GOOD = ('"""Fatorial."""\nimport math\n\n\ndef fatorial(n: int) -> int:\n'
        '    """Calcula n!."""\n    if n < 0:\n        raise ValueError("n negativo")\n'
        '    return math.factorial(n)\n')


def prop(code, filename="fatorial.py", **extra):
    return json.dumps({"filename": filename, "code": code, "explanation": "demo", **extra})


WRITE = [
    ("código limpo -> salvo (não executado)", prop(GOOD)),
    ("import os + os.system", prop("import os\nos.system('echo oi')\n")),
    ("eval de texto", prop("def f(x):\n    return eval(x)\n")),
    ("fuga por atributos __x__", prop("x = ().__class__.__bases__[0].__subclasses__()\n")),
    ("abre arquivo", prop("f = open('x.txt', 'w')\n")),
    ("erro de sintaxe", prop("def f(:\n    pass\n")),
    ("nome de arquivo com ../", prop(GOOD, filename="../evil.py")),
    ("nome reservado do Windows", prop(GOOD, filename="con.py")),
    ("campo extra 'run'", prop(GOOD, run=True)),
    ("LLM devolve lixo", "isto não é json"),
]

REVIEW_CODE = ("import os\ndef f(a=[]):\n    try:\n        return getattr(a, 'x')\n"
               "    except:\n        return os.getcwd()\n")
CLEAN_WITH_WARNING = "def f(a=[]):\n    return len(a)\n"


def show(name, res):
    print(f"[{name}] ok={res.ok}")
    d = res.data or {}
    if "filename" in d:
        print("   salvo em:", d["path"], "| executado:", d["executed"], "| avisos:", d["warnings"])
    if "approved" in d:
        print("   aprovado:", d["approved"], "| achados:", d["findings"], "| avisos:", d["warnings"])
    for r in res.reasons:
        print("   rejeição:", r)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="pede um código ao LLM real")
    args = ap.parse_args()
    allowed = load_allowed_imports(ROOT / "config" / "dev_allowed_imports.txt")
    db = ROOT / "data" / "sqlite.db"
    create_all(db)
    memory = Memory(db)
    logger = JsonlLogger(ROOT / "data" / "logs" / "dev_demo.jsonl")
    out_dir = ROOT / "data" / "dev_output"

    def make(llm):
        return DevPipeline(llm, allowed, out_dir, memory, Permissions(db), logger, ToolMonitor())

    for name, resp in WRITE:
        show(name, make(FakeLLM(resp)).write("Escreva uma função de fatorial em Python"))
    show("revisão: código perigoso (relatório)", make(FakeLLM("")).review(REVIEW_CODE))
    show("revisão: código limpo com aviso", make(FakeLLM("")).review(CLEAN_WITH_WARNING))

    if args.live:
        from dotenv import load_dotenv
        load_dotenv(ROOT / ".env")
        try:
            llm = HttpLLMClient("groq")
        except LLMError as exc:
            print("ERRO ao preparar LLM real:", exc)
            return 1
        show("LIVE LLM real", make(llm).write("Escreva uma função Python que verifica se um número é primo."))
    print("Demo desenvolvimento ok.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

from agents.dev.static_check import load_allowed_imports
from core.llm_client import FakeLLM, HttpLLMClient, LLMError
from core.logger import JsonlLogger
from core.memory import Memory
from core.permissions import Permissions
from core.tool_monitor import ToolMonitor
from pipelines.dev_pipeline import DevPipeline
from scripts.init_db import create_all


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="Escreve ou revisa código Python. Nunca executa.")
    sub = ap.add_subparsers(dest="cmd", required=True)
    w = sub.add_parser("write", help="o LLM escreve um arquivo a partir da tarefa")
    w.add_argument("task")
    r = sub.add_parser("review", help="análise estática de um arquivo seu (não usa o LLM)")
    r.add_argument("path")
    args = ap.parse_args()

    load_dotenv(ROOT / ".env")
    allowed = load_allowed_imports(ROOT / "config" / "dev_allowed_imports.txt")
    db = ROOT / "data" / "sqlite.db"
    create_all(db)
    if args.cmd == "write":
        try:
            llm = HttpLLMClient("groq")
        except LLMError as exc:
            print("ERRO ao preparar LLM:", exc)
            return 1
    else:
        llm = FakeLLM("")  # a revisão não chama o LLM
    pipe = DevPipeline(llm, allowed, ROOT / "data" / "dev_output", Memory(db), Permissions(db),
                       JsonlLogger(ROOT / "data" / "logs" / "dev.jsonl"), ToolMonitor())
    if args.cmd == "write":
        res = pipe.write(args.task)
    else:
        res = pipe.review(Path(args.path).read_text(encoding="utf-8", errors="replace"))
    if res.ok:
        print(json.dumps(res.data, ensure_ascii=False, indent=2))
        return 0 if res.data.get("approved", True) else 2
    for reason in res.reasons:
        print("rejeição:", reason)
    return 1


if __name__ == "__main__":
    sys.exit(main())


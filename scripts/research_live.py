import argparse
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

from agents.research.fetcher import HttpFetcher
from agents.research.urlgate import load_allowed_domains
from core.llm_client import HttpLLMClient, LLMError
from core.logger import JsonlLogger
from core.memory import Memory
from core.permissions import Permissions
from core.tool_monitor import ToolMonitor
from pipelines.research_pipeline import ResearchPipeline
from scripts.init_db import create_all


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser(description="Resume uma página de um domínio permitido.")
    ap.add_argument("url")
    ap.add_argument("question")
    args = ap.parse_args()
    load_dotenv(ROOT / ".env")
    try:
        llm = HttpLLMClient("groq")
    except LLMError as exc:
        print("ERRO ao preparar LLM:", exc)
        return 1
    allowed = load_allowed_domains(ROOT / "config" / "allowed_domains.txt")
    db = ROOT / "data" / "sqlite.db"
    create_all(db)
    pipe = ResearchPipeline(llm, HttpFetcher(allowed, user_agent=os.getenv("RESEARCH_USER_AGENT") or None),
                            allowed, Memory(db), Permissions(db),
                            JsonlLogger(ROOT / "data" / "logs" / "research.jsonl"), ToolMonitor())
    res = pipe.run(args.url, args.question)
    if res.ok:
        print(json.dumps(res.data, ensure_ascii=False, indent=2))
        return 0
    for r in res.reasons:
        print("rejeição:", r)
    return 1


if __name__ == "__main__":
    sys.exit(main())


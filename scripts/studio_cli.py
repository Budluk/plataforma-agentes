import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

from agents.studio.client import StudioClient, StudioError, load_studio_hosts
from core.logger import JsonlLogger
from core.memory import Memory
from core.permissions import Permissions
from core.tool_monitor import ToolMonitor
from pipelines.studio_pipeline import StudioPipeline
from scripts.init_db import create_all

USAGE = """uso:
  studio_cli.py health
  studio_cli.py list
  studio_cli.py create "<descrição do app>"
  studio_cli.py status <project_id>
  studio_cli.py validate <project_id>"""


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    if len(sys.argv) < 2:
        print(USAGE)
        return 1
    load_dotenv(ROOT / ".env")
    db = ROOT / "data" / "sqlite.db"
    create_all(db)
    try:
        client = StudioClient(
            os.getenv("STUDIO_BASE_URL") or "http://127.0.0.1:8787",
            load_studio_hosts(ROOT / "config" / "studio_hosts.txt"),
            timeout=float(os.getenv("STUDIO_TIMEOUT_MS") or 30000) / 1000.0,
        )
    except (StudioError, ValueError) as exc:
        print("ERRO ao preparar o cliente studio:", exc)
        return 1
    pipeline = StudioPipeline(client, Memory(db), Permissions(db),
                              JsonlLogger(ROOT / "data" / "logs" / "studio.jsonl"), ToolMonitor())
    cmd = sys.argv[1].strip().lower()
    if cmd == "health":
        result = pipeline.health()
    elif cmd == "list":
        result = pipeline.list_apps()
    elif cmd == "create":
        result = pipeline.create(" ".join(sys.argv[2:]).strip())
    elif cmd == "status" and len(sys.argv) == 3:
        result = pipeline.status(sys.argv[2])
    elif cmd == "validate" and len(sys.argv) == 3:
        result = pipeline.validate(sys.argv[2])
    else:
        print(USAGE)
        return 1
    print(json.dumps({"ok": result.ok, "data": result.data, "reasons": result.reasons},
                     ensure_ascii=False, indent=2))
    return 0 if result.ok else 1


if __name__ == "__main__":
    sys.exit(main())

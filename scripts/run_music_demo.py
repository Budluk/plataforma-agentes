import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core.llm_client import FakeLLM, HttpLLMClient, LLMError
from core.logger import JsonlLogger
from core.memory import Memory
from core.permissions import Permissions
from core.tool_monitor import ToolMonitor
from pipelines.music_pipeline import MusicPipeline
from scripts.init_db import create_all


def req(action, notes, semitones=0):
    return json.dumps({"action": action, "notes": notes, "semitones": semitones})


SCENARIOS = [
    ("acorde C maior", "C4 E4 G4", req("identify_chord", [60, 64, 67])),
    ("transpor +2", "C maior para D", req("transpose", [60, 64, 67], 2)),
    ("tablatura", "tablatura E2 A2 D3", req("tab", [40, 45, 50])),
    ("fora do alcance (tab)", "nota grave demais", req("tab", [20])),
    ("transposição estoura", "sobe demais", req("transpose", [126], 5)),
    ("LLM devolve lixo", "qualquer", "isto não é json"),
    ("campo extra perigoso", "x", json.dumps({"action": "tab", "notes": [60], "shell": "rm -rf"})),
]


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    ap = argparse.ArgumentParser()
    ap.add_argument("--live", action="store_true", help="usa o LLM real no 1º cenário")
    args = ap.parse_args()
    real = None
    if args.live:
        from dotenv import load_dotenv
        load_dotenv(ROOT / ".env")
        try:
            real = HttpLLMClient("groq")
        except LLMError as exc:
            print("ERRO ao preparar LLM real:", exc)
            return 1
    db = ROOT / "data" / "sqlite.db"
    create_all(db)
    memory = Memory(db)
    for i, (name, text, fake) in enumerate(SCENARIOS):
        llm = real if (real and i == 0) else FakeLLM(fake)
        if real and i == 0:
            text = "Identifique o acorde com as notas C4, E4 e G4 (C4 = MIDI 60)."
        pipe = MusicPipeline(llm, memory, Permissions(db),
                             JsonlLogger(ROOT / "data" / "logs" / "music_demo.jsonl"), ToolMonitor())
        res = pipe.run(text)
        print(f"[{name}] ok={res.ok}")
        if res.data:
            print("   resultado:", json.dumps(res.data, ensure_ascii=False))
        for r in res.reasons:
            print("   rejeição:", r)
    print("Demo música ok.")
    return 0


if __name__ == "__main__":
    sys.exit(main())


import json
import sqlite3
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LOG = ROOT / "data" / "logs" / "smoke.jsonl"
DB = ROOT / "data" / "smoke.db"

def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    LOG.parent.mkdir(parents=True, exist_ok=True)
    registro = {"evento": "smoke", "valor": 42}
    LOG.write_text(json.dumps(registro) + "\n", encoding="utf-8")
    linhas = LOG.read_text(encoding="utf-8").strip().splitlines()
    if len(linhas) != 1 or json.loads(linhas[0]) != registro:
        print("ERRO: JSONL não bate")
        return 1

    if DB.exists():
        DB.unlink()
    con = sqlite3.connect(DB)
    con.execute("CREATE TABLE t (id INTEGER PRIMARY KEY, nome TEXT)")
    con.execute("INSERT INTO t (nome) VALUES (?)", ("smoke",))
    con.commit()
    linhas_db = con.execute("SELECT id, nome FROM t").fetchall()
    con.close()
    if linhas_db != [(1, "smoke")]:
        print("ERRO: SQLite não bate:", linhas_db)
        return 1
    print("Smoke I/O ok.")
    return 0

if __name__ == "__main__":
    sys.exit(main())


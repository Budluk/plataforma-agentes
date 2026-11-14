import sqlite3
import sys
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from core.memory import Memory
from core.permissions import Permissions


def create_all(db_path) -> dict:
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    perms = Permissions(db_path)
    perms.init_schema()
    perms.seed()
    Memory(db_path).init_schema()
    with closing(sqlite3.connect(db_path)) as con:
        tables = sorted(r[0] for r in con.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"))
        caps = con.execute("SELECT COUNT(*) FROM capabilities").fetchone()[0]
    return {"tables": tables, "capabilities": caps}


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    info = create_all(ROOT / "data" / "sqlite.db")
    print("Tabelas:", ", ".join(info["tables"]))
    print("Capacidades:", info["capabilities"])
    print("init_db ok.")
    return 0


if __name__ == "__main__":
    sys.exit(main())


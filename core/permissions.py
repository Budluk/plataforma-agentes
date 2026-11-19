from __future__ import annotations
import sqlite3
from contextlib import closing

from core.tool_registry import SEED  # noqa: F401


class Permissions:
    def __init__(self, db_path):
        self.db_path = str(db_path)

    def init_schema(self) -> None:
        with closing(sqlite3.connect(self.db_path)) as con:
            con.execute("CREATE TABLE IF NOT EXISTS capabilities ("
                        "agent TEXT NOT NULL, tool TEXT NOT NULL, PRIMARY KEY (agent, tool))")
            con.commit()

    def seed(self) -> None:
        with closing(sqlite3.connect(self.db_path)) as con:
            con.executemany("INSERT OR IGNORE INTO capabilities (agent, tool) VALUES (?, ?)", SEED)
            con.commit()

    def is_allowed(self, agent: str, tool: str) -> bool:
        try:
            with closing(sqlite3.connect(self.db_path)) as con:
                row = con.execute("SELECT 1 FROM capabilities WHERE agent=? AND tool=?",
                                  (agent, tool)).fetchone()
            return row is not None
        except sqlite3.Error:
            return False  # falha fechada






from __future__ import annotations
import sqlite3
from contextlib import closing

SEED = [
    ("analyst", "get_market_data"),
    ("analyst", "write_research_note"),
    ("risk_manager", "read_portfolio"),
    ("pipeline", "emit_alert"), ("music_agent", "identify_chord"), ("music_agent", "transpose_notes"), ("music_agent", "to_guitar_tab"), ("sales_agent", "compute_margin"), ("sales_agent", "suggest_price"), ("sales_agent", "break_even"), ("sales_agent", "analyze_funnel"), ("research_agent", "fetch_page"), ("dev_agent", "analyze_code"), ("dev_agent", "save_code_file"),
    ("studio_agent", "studio_health"),
    ("studio_agent", "studio_list_apps"),
    ("studio_agent", "studio_create_app"),
    ("studio_agent", "studio_app_status"),
    ("studio_agent", "studio_validate_app"),
]


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






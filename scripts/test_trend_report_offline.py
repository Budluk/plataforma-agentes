from __future__ import annotations

import importlib.util
import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from content_automation.manual_import import COLUMNS, import_observations
from content_automation.trend_store import TrendStore
from content_automation.trends import TrendCandidate

# URL montada em partes: nenhum link literal neste arquivo.
URL_A = "https" + "://" + "example.com" + "/pauta-a"
URL_B = "https" + "://" + "example.com" + "/pauta-b"

HEADER = ",".join(COLUMNS)


def load_report_module():
    path = ROOT / "scripts" / "trend_report.py"
    spec = importlib.util.spec_from_file_location("trend_report", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def row(url, topic, stamp, views):
    return f'manual,"{topic}","{url}","pt-BR","BR","{stamp}",{views}'


class TrendReportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

        self.root = Path(self.temp.name)
        self.db = self.root / "report.sqlite3"
        self.store = TrendStore(self.db)
        self.module = load_report_module()

    def write_csv(self, lines):
        path = self.root / "entrada.csv"
        path.write_text(
            "\n".join([HEADER, *lines]) + "\n", encoding="utf-8"
        )
        return path

    def test_empty_database_reports_nothing(self):
        output = io.StringIO()
        with redirect_stdout(output):
            self.module.print_report(self.module.build_rows(self.store))

        self.assertIn("Nenhuma observacao", output.getvalue())

    def test_single_observation_is_pending(self):
        self.store.save(TrendCandidate(
            source="manual",
            topic="Pauta A",
            url=URL_A,
            language="pt-BR",
            region="BR",
            collected_at=datetime.fromisoformat(
                "2026-11-17T09:00:00+00:00"
            ),
            views=100,
        ))

        rows = self.module.build_rows(self.store)

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["status"], "insufficient_history")
        self.assertIsNone(rows[0]["views_per_hour"])

    def test_row_without_growth_goes_last(self):
        import_observations(self.store, self.write_csv([
            row(URL_A, "Pauta A", "2026-11-17T09:00:00+00:00", 100),
            row(URL_A, "Pauta A", "2026-11-17T10:00:00+00:00", 700),
            row(URL_B, "Pauta B", "2026-11-17T09:00:00+00:00", 50),
        ]))

        rows = self.module.build_rows(self.store)

        self.assertEqual(len(rows), 2)
        self.assertEqual(rows[0]["url"], URL_A)
        self.assertAlmostEqual(rows[0]["views_per_hour"], 600.0)
        self.assertEqual(rows[1]["url"], URL_B)
        self.assertIsNone(rows[1]["views_per_hour"])

    def test_order_is_by_views_per_hour(self):
        import_observations(self.store, self.write_csv([
            row(URL_A, "Pauta A", "2026-11-17T09:00:00+00:00", 100),
            row(URL_A, "Pauta A", "2026-11-17T10:00:00+00:00", 200),
            row(URL_B, "Pauta B", "2026-11-17T09:00:00+00:00", 100),
            row(URL_B, "Pauta B", "2026-11-17T10:00:00+00:00", 900),
        ]))

        rows = self.module.build_rows(self.store)

        self.assertEqual(rows[0]["url"], URL_B)
        self.assertEqual(rows[1]["url"], URL_A)

    def test_report_mentions_limit_of_measurement(self):
        import_observations(self.store, self.write_csv([
            row(URL_A, "Pauta A", "2026-11-17T09:00:00+00:00", 100),
            row(URL_A, "Pauta A", "2026-11-17T10:00:00+00:00", 700),
        ]))

        output = io.StringIO()
        with redirect_stdout(output):
            self.module.print_report(self.module.build_rows(self.store))

        text = output.getvalue()
        self.assertIn("nao significa tendencia viral", text)
        self.assertIn("Pauta A", text)

    def test_main_without_csv_does_not_fail(self):
        code = self.module.main(["--db", str(self.db)])
        self.assertEqual(code, 0)

    def test_main_with_missing_csv_returns_error(self):
        code = self.module.main([
            "--db", str(self.db),
            "--csv", str(self.root / "ausente.csv"),
        ])
        self.assertEqual(code, 1)

    def test_main_imports_and_reports(self):
        csv = self.write_csv([
            row(URL_A, "Pauta A", "2026-11-17T09:00:00+00:00", 100),
            row(URL_A, "Pauta A", "2026-11-17T10:00:00+00:00", 700),
            row(URL_B, "Pauta B", "17/11/2026", 10),
        ])

        output = io.StringIO()
        with redirect_stdout(output):
            code = self.module.main(["--db", str(self.db), "--csv", str(csv)])

        text = output.getvalue()
        self.assertEqual(code, 0)
        self.assertIn("Importadas: 2", text)
        self.assertIn("rejeitadas: 1", text)
        self.assertIn("linha 4", text)
        self.assertIn("Pauta A", text)

    def test_main_reports_invalid_line_number(self):
        csv = self.write_csv([
            row(URL_A, "Pauta A", "2026-11-17T09:00:00+00:00", -1),
        ])

        output = io.StringIO()
        with redirect_stdout(output):
            code = self.module.main(["--db", str(self.db), "--csv", str(csv)])

        self.assertEqual(code, 0)
        self.assertIn("linha 2", output.getvalue())


if __name__ == "__main__":
    unittest.main(verbosity=2)
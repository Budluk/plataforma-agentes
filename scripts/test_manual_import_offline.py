from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from content_automation.manual_import import COLUMNS, import_observations
from content_automation.trend_history import (
    analyze_history,
    restore_candidate,
)
from content_automation.trend_store import TrendStore


# URLs montadas em partes: evita conversao automatica em link
# por editores, copiar-e-colar ou pelo proprio terminal.
SCHEME = "https" + "://"
HOST = "example.com"
PATH_A = "/pauta"
PATH_B = "/pauta-dois"

URL_VALID = SCHEME + HOST + PATH_A
URL_OTHER = SCHEME + HOST + PATH_B
URL_BAD_SCHEME = "http" + "://" + HOST + PATH_A
URL_WITH_PORT = SCHEME + HOST + ":8443" + PATH_A
URL_WITH_CREDS = SCHEME + "user" + ":" + "pw" + "@" + HOST + PATH_A

HEADER = ",".join(COLUMNS)
STAMP_EARLY = "2026-11-17T09:00:00+00:00"
STAMP_LATER = "2026-11-17T10:00:00+00:00"


def row(url=URL_VALID, topic="Pauta de teste", stamp=STAMP_EARLY, views="1200"):
    return (
        f'manual,"{topic}","{url}","pt-BR","BR","{stamp}",{views}'
    )


class ManualImportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

        self.root = Path(self.temp.name)
        self.store = TrendStore(self.root / "manual.sqlite3")

    def write_csv(self, lines, header=HEADER):
        path = self.root / "entrada.csv"
        text = "\n".join([header, *lines]) + "\n"
        path.write_text(text, encoding="utf-8")
        return path

    def test_valid_rows_imported(self):
        path = self.write_csv([
            row(),
            row(stamp=STAMP_LATER, views="1800"),
        ])
        result = import_observations(self.store, path)

        self.assertTrue(result.ok, result.rejected)
        self.assertEqual(result.inserted, 2)
        self.assertEqual(result.duplicates, 0)
        self.assertEqual(len(self.store.list_observations()), 2)

    def test_reimport_only_counts_duplicates(self):
        path = self.write_csv([
            row(),
            row(stamp=STAMP_LATER, views="1800"),
        ])
        import_observations(self.store, path)
        result = import_observations(self.store, path)

        self.assertEqual(result.inserted, 0)
        self.assertEqual(result.duplicates, 2)
        self.assertEqual(len(self.store.list_observations()), 2)

    def test_empty_views_accepted_as_unknown(self):
        result = import_observations(
            self.store, self.write_csv([row(views="")])
        )

        self.assertEqual(result.inserted, 1, result.rejected)
        self.assertIsNone(self.store.list_observations()[0]["views"])

    def test_invalid_rows_rejected_with_line_numbers(self):
        lines = [
            row(url=URL_BAD_SCHEME),
            row(stamp="17/11/2026 09:00"),
            row(views="-5"),
            row(topic=""),
        ]
        result = import_observations(self.store, self.write_csv(lines))

        self.assertEqual(result.inserted, 0)
        self.assertEqual([line for line, _ in result.rejected], [2, 3, 4, 5])
        self.assertEqual(len(self.store.list_observations()), 0)

    def test_rejection_message_shows_received_value(self):
        result = import_observations(
            self.store, self.write_csv([row(url=URL_WITH_PORT)])
        )

        self.assertEqual(result.inserted, 0)
        _, reason = result.rejected[0]
        self.assertIn("url", reason)
        self.assertIn("8443", reason)

    def test_one_bad_row_does_not_block_others(self):
        result = import_observations(
            self.store,
            self.write_csv([
                row(),
                "linha invalida",
                row(stamp=STAMP_LATER, views="1800"),
            ]),
        )

        self.assertEqual(result.inserted, 2, result.rejected)
        self.assertEqual(len(result.rejected), 1)
        self.assertFalse(result.ok)

    def test_blank_lines_skipped(self):
        result = import_observations(
            self.store, self.write_csv(["", "   ", row()])
        )

        self.assertEqual(result.inserted, 1, result.rejected)
        self.assertEqual(result.rejected, [])

    def test_wrong_header_rejected(self):
        path = self.write_csv([row()], header="a,b,c,d,e,f,g")
        with self.assertRaises(ValueError):
            import_observations(self.store, path)

    def test_missing_file(self):
        with self.assertRaises(FileNotFoundError):
            import_observations(self.store, self.root / "ausente.csv")

    def test_wrong_store_type(self):
        with self.assertRaises(TypeError):
            import_observations("nao-e-store", self.write_csv([row()]))

    def test_imported_data_feeds_history(self):
        import_observations(
            self.store,
            self.write_csv([
                row(),
                row(stamp=STAMP_LATER, views="1800"),
            ]),
        )

        rows = self.store.list_observations()
        self.assertEqual(len(rows), 2)

        reference = restore_candidate(rows[0])
        result = analyze_history(self.store, reference)

        self.assertEqual(result.status, "measured")
        self.assertEqual(result.observations, 2)
        self.assertEqual(result.growth.delta_views, 600)

    def test_history_does_not_mix_contents(self):
        import_observations(
            self.store,
            self.write_csv([
                row(),
                row(stamp=STAMP_LATER, views="1800"),
                row(url=URL_OTHER, views="50"),
            ]),
        )

        rows = self.store.list_observations()
        reference = restore_candidate(
            [r for r in rows if r["url"] == URL_VALID][0]
        )
        result = analyze_history(self.store, reference)

        self.assertEqual(result.observations, 2)
        self.assertEqual(result.growth.delta_views, 600)

    def test_example_file_is_valid(self):
        example = (
            ROOT / "config" / "content_automation"
            / "observations.example.csv"
        )
        result = import_observations(self.store, example)

        self.assertTrue(result.ok, result.rejected)
        self.assertEqual(result.inserted, 2)


if __name__ == "__main__":
    unittest.main(verbosity=2)
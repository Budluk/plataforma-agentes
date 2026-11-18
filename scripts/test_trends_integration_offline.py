from __future__ import annotations

import sys
import tempfile
import unittest
from dataclasses import replace
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from content_automation.trends import TrendCandidate, FakeTrendSource
from content_automation.trend_store import TrendStore
from content_automation.trend_growth import compare_growth


def restore_candidate(row: dict) -> TrendCandidate:
    """Revalida os dados recuperados do SQLite."""
    data = dict(row)
    data["collected_at"] = datetime.fromisoformat(
        data["collected_at"]
    )
    return TrendCandidate(**data)


class TrendsIntegrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

        self.path = Path(self.temp.name) / "integration.sqlite3"
        self.store = TrendStore(self.path)
        self.previous = FakeTrendSource().collect()[0]
        self.current = replace(
            self.previous,
            collected_at=self.previous.collected_at
            + timedelta(hours=1),
            views=1800,
        )

    def save_and_restore_pair(self, current):
        # Salva fora da ordem cronologica propositalmente.
        self.assertTrue(self.store.save(current))
        self.assertTrue(self.store.save(self.previous))

        # Nova instancia para verificar persistencia em disco.
        reopened = TrendStore(self.path)
        rows = reopened.list_observations()

        self.assertEqual(len(rows), 2)
        return [restore_candidate(row) for row in rows]

    def test_storage_to_growth(self):
        previous, current = self.save_and_restore_pair(self.current)

        self.assertEqual(previous, self.previous)
        self.assertEqual(current, self.current)

        result = compare_growth(previous, current)

        self.assertEqual(result.status, "measured")
        self.assertEqual(result.delta_views, 600)
        self.assertAlmostEqual(result.growth_pct, 50.0)
        self.assertAlmostEqual(result.views_per_hour, 600.0)

    def test_duplicate_does_not_create_extra_observation(self):
        self.store.save(self.previous)
        self.store.save(self.current)

        self.assertFalse(self.store.save(self.current))

        rows = TrendStore(self.path).list_observations()
        self.assertEqual(len(rows), 2)

        previous, current = [
            restore_candidate(row) for row in rows
        ]
        self.assertEqual(
            compare_growth(previous, current).delta_views,
            600,
        )

    def test_missing_views_remain_insufficient(self):
        previous, current = self.save_and_restore_pair(
            replace(self.current, views=None)
        )

        result = compare_growth(previous, current)

        self.assertEqual(result.status, "insufficient_data")
        self.assertIsNone(result.views_per_hour)

    def test_decreasing_counter_remains_inconsistent(self):
        previous, current = self.save_and_restore_pair(
            replace(self.current, views=1000)
        )

        result = compare_growth(previous, current)

        self.assertEqual(result.status, "inconsistent_data")
        self.assertIsNone(result.growth_pct)

    def test_different_content_cannot_be_compared(self):
        previous, current = self.save_and_restore_pair(
            replace(
                self.current,
                url=self.current.url + "/outro-conteudo",
            )
        )

        with self.assertRaises(ValueError):
            compare_growth(previous, current)


if __name__ == "__main__":
    unittest.main(verbosity=2)
from __future__ import annotations

import sys
import tempfile
import unittest
from dataclasses import replace
from datetime import timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from content_automation.trend_history import analyze_history
from content_automation.trend_store import TrendStore
from content_automation.trends import FakeTrendSource


class HistoryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)

        self.store = TrendStore(
            Path(self.temp.name) / "history.sqlite3"
        )
        self.first = FakeTrendSource().collect()[0]

    def observation(self, hours, views):
        return replace(
            self.first,
            collected_at=self.first.collected_at
            + timedelta(hours=hours),
            views=views,
        )

    def test_empty_history(self):
        result = analyze_history(self.store, self.first)
        self.assertEqual(result.status, "insufficient_history")
        self.assertEqual(result.observations, 0)
        self.assertIsNone(result.growth)

    def test_single_observation(self):
        self.store.save(self.first)
        result = analyze_history(self.store, self.first)
        self.assertEqual(result.status, "insufficient_history")
        self.assertEqual(result.observations, 1)

    def test_two_observations_measured(self):
        self.store.save(self.observation(0, 1200))
        self.store.save(self.observation(1, 1800))

        result = analyze_history(self.store, self.first)

        self.assertEqual(result.status, "measured")
        self.assertEqual(result.observations, 2)
        self.assertEqual(result.growth.delta_views, 600)
        self.assertAlmostEqual(result.growth.views_per_hour, 600.0)

    def test_uses_latest_pair_only(self):
        self.store.save(self.observation(0, 100))
        self.store.save(self.observation(1, 200))
        self.store.save(self.observation(2, 500))

        result = analyze_history(self.store, self.first)

        self.assertEqual(result.observations, 3)
        self.assertEqual(result.growth.delta_views, 300)
        self.assertAlmostEqual(result.growth.growth_pct, 150.0)

    def test_ignores_other_content(self):
        self.store.save(self.observation(0, 1200))
        self.store.save(self.observation(1, 1800))

        other = replace(
            self.first,
            url=self.first.url + "/outro-conteudo",
        )
        self.store.save(other)

        result = analyze_history(self.store, self.first)

        self.assertEqual(result.observations, 2)
        self.assertEqual(result.growth.delta_views, 600)

    def test_respects_minimum_interval(self):
        self.store.save(self.observation(0, 1200))
        self.store.save(
            replace(
                self.observation(1, 1800),
                collected_at=self.first.collected_at
                + timedelta(seconds=60),
            )
        )

        result = analyze_history(self.store, self.first)

        self.assertEqual(result.status, "insufficient_data")
        self.assertIsNone(result.growth.growth_pct)

    def test_missing_views(self):
        self.store.save(self.observation(0, 1200))
        self.store.save(self.observation(1, None))

        result = analyze_history(self.store, self.first)

        self.assertEqual(result.status, "insufficient_data")
        self.assertIsNone(result.growth.delta_views)

    def test_decreasing_counter(self):
        self.store.save(self.observation(0, 1800))
        self.store.save(self.observation(1, 1200))

        result = analyze_history(self.store, self.first)

        self.assertEqual(result.status, "inconsistent_data")
        self.assertIsNone(result.growth.growth_pct)

    def test_requires_store_and_reference(self):
        with self.assertRaises(TypeError):
            analyze_history("nao-e-store", self.first)
        with self.assertRaises(TypeError):
            analyze_history(self.store, {"url": self.first.url})


if __name__ == "__main__":
    unittest.main(verbosity=2)
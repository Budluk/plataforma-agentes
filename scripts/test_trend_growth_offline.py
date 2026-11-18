from __future__ import annotations

import sys
import unittest
from dataclasses import replace
from datetime import timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from content_automation.trends import FakeTrendSource
from content_automation.trend_growth import compare_growth


class GrowthTests(unittest.TestCase):
    def setUp(self):
        self.previous = FakeTrendSource().collect()[0]
        self.current = replace(
            self.previous,
            collected_at=self.previous.collected_at + timedelta(hours=1),
            views=1800,
        )

    def test_growth_calculation(self):
        result = compare_growth(self.previous, self.current)
        self.assertEqual(result.status, "measured")
        self.assertEqual(result.delta_views, 600)
        self.assertAlmostEqual(result.growth_pct, 50.0)
        self.assertAlmostEqual(result.views_per_hour, 600.0)
        self.assertEqual(result.elapsed_seconds, 3600.0)

    def test_zero_baseline_has_no_percentage(self):
        previous = replace(self.previous, views=0)
        result = compare_growth(previous, self.current)
        self.assertEqual(result.status, "measured")
        self.assertEqual(result.delta_views, 1800)
        self.assertIsNone(result.growth_pct)

    def test_missing_views(self):
        pairs = (
            (replace(self.previous, views=None), self.current),
            (self.previous, replace(self.current, views=None)),
        )
        for previous, current in pairs:
            with self.subTest(previous=previous.views, current=current.views):
                result = compare_growth(previous, current)
                self.assertEqual(result.status, "insufficient_data")
                self.assertIsNone(result.views_per_hour)

    def test_decreasing_counter(self):
        result = compare_growth(
            self.previous,
            replace(self.current, views=1000),
        )
        self.assertEqual(result.status, "inconsistent_data")
        self.assertIsNone(result.growth_pct)

    def test_minimum_interval(self):
        too_soon = replace(
            self.current,
            collected_at=self.previous.collected_at + timedelta(seconds=299),
        )
        result = compare_growth(self.previous, too_soon)
        self.assertEqual(result.status, "insufficient_data")

        boundary = replace(
            too_soon,
            collected_at=self.previous.collected_at + timedelta(seconds=300),
        )
        self.assertEqual(
            compare_growth(self.previous, boundary).status,
            "measured",
        )

    def test_different_identity_rejected(self):
        changes = (
            {"source": "outra"},
            {"url": self.current.url + "/outro"},
            {"language": "en"},
            {"region": "US"},
        )
        for change in changes:
            with self.subTest(change=change):
                with self.assertRaises(ValueError):
                    compare_growth(
                        self.previous,
                        replace(self.current, **change),
                    )

    def test_equal_or_reversed_time_rejected(self):
        for offset in (0, -1):
            with self.subTest(offset=offset):
                current = replace(
                    self.current,
                    collected_at=self.previous.collected_at
                    + timedelta(seconds=offset),
                )
                with self.assertRaises(ValueError):
                    compare_growth(self.previous, current)

    def test_different_timezone_same_elapsed_time(self):
        current = replace(
            self.current,
            collected_at=self.current.collected_at.astimezone(
                timezone(timedelta(hours=-3))
            ),
        )
        result = compare_growth(self.previous, current)
        self.assertEqual(result.elapsed_seconds, 3600.0)
        self.assertAlmostEqual(result.views_per_hour, 600.0)

    def test_unchanged_counter(self):
        result = compare_growth(
            self.previous,
            replace(self.current, views=self.previous.views),
        )
        self.assertEqual(result.status, "measured")
        self.assertEqual(result.delta_views, 0)
        self.assertEqual(result.growth_pct, 0.0)
        self.assertEqual(result.views_per_hour, 0.0)

    def test_different_metric_rejected(self):
        outra = replace(self.current, metric="search_index")
        with self.assertRaises(ValueError):
            compare_growth(self.previous, outra)

    def test_same_metric_still_measures(self):
        iguais = replace(self.current, metric="views")
        resultado = compare_growth(self.previous, iguais)
        self.assertEqual(resultado.status, "measured")

    def test_metric_case_is_not_accepted(self):
        with self.assertRaises(ValueError):
            replace(self.previous, metric="Views")

    def test_invalid_interval_rejected(self):
        for interval in (True, 0, -1, 1.5, "300"):
            with self.subTest(interval=interval):
                with self.assertRaises(ValueError):
                    compare_growth(
                        self.previous,
                        self.current,
                        min_interval_seconds=interval,
                    )


if __name__ == "__main__":
    unittest.main(verbosity=2)
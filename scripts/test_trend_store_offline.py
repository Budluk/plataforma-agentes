from __future__ import annotations

import sys
import tempfile
import unittest
from dataclasses import replace
from datetime import timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from content_automation.trends import FakeTrendSource
from content_automation.trend_store import TrendStore


class TrendStoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "trends.sqlite3"
        self.store = TrendStore(self.path)
        self.candidate = FakeTrendSource().collect()[0]

    def test_save_and_read(self):
        self.assertTrue(self.store.save(self.candidate))
        rows = self.store.list_observations()
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["views"], 1200)
        self.assertEqual(rows[0]["topic"], self.candidate.topic)

    def test_duplicate_not_inserted(self):
        self.assertTrue(self.store.save(self.candidate))
        self.assertFalse(self.store.save(self.candidate))
        self.assertEqual(len(self.store.list_observations()), 1)

    def test_later_observation_preserved(self):
        later = replace(
            self.candidate,
            collected_at=self.candidate.collected_at
            + timedelta(hours=1),
            views=1800,
        )
        self.store.save(later)
        self.store.save(self.candidate)
        rows = self.store.list_observations()
        self.assertEqual([row["views"] for row in rows], [1200, 1800])

    def test_persists_after_reopening(self):
        self.store.save(self.candidate)
        reopened = TrendStore(self.path)
        self.assertEqual(len(reopened.list_observations()), 1)

    def test_same_instant_different_timezone_is_duplicate(self):
        alternate = replace(
            self.candidate,
            collected_at=self.candidate.collected_at.astimezone(
                timezone(timedelta(hours=-3))
            ),
        )
        self.assertTrue(self.store.save(self.candidate))
        self.assertFalse(self.store.save(alternate))

    def test_invalid_limit_rejected(self):
        for limit in (0, -1, 1001, True, "10"):
            with self.subTest(limit=limit):
                with self.assertRaises(ValueError):
                    self.store.list_observations(limit)

    def test_wrong_candidate_type_rejected(self):
        with self.assertRaises(TypeError):
            self.store.save({"topic": "invalido"})

    def test_unknown_views_preserved(self):
        self.store.save(replace(self.candidate, views=None))
        self.assertIsNone(self.store.list_observations()[0]["views"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
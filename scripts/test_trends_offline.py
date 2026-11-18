from __future__ import annotations

import json
import sys
import unittest
from dataclasses import FrozenInstanceError, replace
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from content_automation.trends import FakeTrendSource


class TrendTests(unittest.TestCase):
    def setUp(self):
        self.candidate = FakeTrendSource().collect()[0]

    def test_fake_is_deterministic(self):
        self.assertEqual(
            FakeTrendSource().collect(),
            FakeTrendSource().collect(),
        )

    def test_status_is_candidate(self):
        self.assertEqual(
            self.candidate.to_dict()["status"], "candidate"
        )

    def test_json_serializable(self):
        payload = json.dumps(self.candidate.to_dict())
        self.assertEqual(
            json.loads(payload)["source"], "fake"
        )

    def test_invalid_views_rejected(self):
        for value in (-1, True, 1.5, "100"):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    replace(self.candidate, views=value)

    def test_naive_datetime_rejected(self):
        naive = self.candidate.collected_at.replace(tzinfo=None)
        with self.assertRaises(ValueError):
            replace(self.candidate, collected_at=naive)

    def test_invalid_urls_rejected(self):
        for url in (
            "[example.com](http://example.com)",
            "https://",
            "[example.com](https://user:password@example.com)",
            "[example.com](https://example.com:8080)",
            "[example.com](https://example.com/space) here",
        ):
            with self.subTest(url=url):
                with self.assertRaises(ValueError):
                    replace(self.candidate, url=url)

    def test_empty_topic_rejected(self):
        with self.assertRaises(ValueError):
            replace(self.candidate, topic=" ")

    def test_candidate_is_frozen(self):
        with self.assertRaises(FrozenInstanceError):
            self.candidate.topic = "alterado"


if __name__ == "__main__":
    unittest.main(verbosity=2)
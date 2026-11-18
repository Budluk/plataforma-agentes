from __future__ import annotations

import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from content_automation.trend_windows import parse_stamp, select_frame


def observation(stamp, views):
    return {
        "source": "manual",
        "topic": "Pauta",
        "url": "https" + "://" + "example.com" + "/pauta",
        "language": "pt-BR",
        "region": "BR",
        "collected_at": stamp,
        "views": views,
    }


BASE = "2026-11-17T09:00:00+00:00"

HOUR_1 = "2026-11-17T10:00:00+00:00"
HOUR_2 = "2026-11-17T11:00:00+00:00"
HOUR_3 = "2026-11-17T12:00:00+00:00"
DAY_2 = "2026-11-18T12:00:00+00:00"


class WindowTests(unittest.TestCase):
    def test_needs_two_observations(self):
        self.assertIsNone(select_frame([]))
        self.assertIsNone(select_frame([observation(BASE, 10)]))

    def test_latest_uses_last_pair(self):
        rows = [
            observation(BASE, 10),
            observation(HOUR_1, 20),
            observation(HOUR_2, 50),
        ]
        frame = select_frame(rows, mode="latest")

        self.assertEqual(frame.previous["views"], 20)
        self.assertEqual(frame.current["views"], 50)
        self.assertEqual(frame.observations, 3)
        self.assertEqual(frame.observations_in_frame, 2)

    def test_full_uses_first_and_last(self):
        rows = [
            observation(BASE, 10),
            observation(HOUR_1, 20),
            observation(HOUR_2, 50),
        ]
        frame = select_frame(rows, mode="full")

        self.assertEqual(frame.previous["views"], 10)
        self.assertEqual(frame.current["views"], 50)
        self.assertEqual(frame.observations_in_frame, 3)

    def test_window_excludes_older_observations(self):
        rows = [
            observation(BASE, 1),
            observation(HOUR_2, 30),
            observation(HOUR_3, 90),
        ]
        frame = select_frame(rows, mode="window", window_hours=2)

        self.assertEqual(frame.previous["views"], 30)
        self.assertEqual(frame.current["views"], 90)
        self.assertEqual(frame.observations_in_frame, 2)
        self.assertEqual(frame.observations, 3)

    def test_window_with_only_one_inside_returns_none(self):
        rows = [
            observation(BASE, 1),
            observation(DAY_2, 90),
        ]
        self.assertIsNone(
            select_frame(rows, mode="window", window_hours=2)
        )

    def test_unordered_input_is_sorted(self):
        rows = [
            observation(HOUR_2, 50),
            observation(BASE, 10),
            observation(HOUR_1, 20),
        ]
        frame = select_frame(rows, mode="full")

        self.assertEqual(frame.previous["views"], 10)
        self.assertEqual(frame.current["views"], 50)

    def test_invalid_mode_rejected(self):
        rows = [observation(BASE, 1), observation(HOUR_1, 2)]
        with self.assertRaises(ValueError):
            select_frame(rows, mode="media")

    def test_invalid_window_rejected(self):
        rows = [observation(BASE, 1), observation(HOUR_1, 2)]
        for value in (0, -1, True, 1.5, "24"):
            with self.subTest(value=value):
                with self.assertRaises(ValueError):
                    select_frame(rows, mode="window", window_hours=value)

    def test_naive_timestamp_rejected(self):
        with self.assertRaises(ValueError):
            parse_stamp("2026-11-17T09:00:00")

    def test_offset_timestamps_are_comparable(self):
        rows = [
            observation("2026-11-17T09:00:00+00:00", 10),
            observation("2026-11-17T07:00:00-03:00", 40),
        ]
        frame = select_frame(rows, mode="latest")

        self.assertEqual(frame.current["views"], 40)


if __name__ == "__main__":
    unittest.main(verbosity=2)
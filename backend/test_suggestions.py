"""Run: python -m unittest test_suggestions -v (no database connection)."""
import unittest
from datetime import datetime, timezone
from api.suggestions import recommend_times

EVENT = {"month": "2026-12", "timeZone": "America/Los_Angeles"}
NOW = datetime(2026, 12, 1, tzinfo=timezone.utc)

def person(name, ranges, submitted=True):
    return {"name": name, "sharedAt": "saved" if submitted else None,
            "available": [{"date": "2026-12-10", "start": a, "end": b} for a, b in ranges]}

class SuggestionsTests(unittest.TestCase):
    def result(self, people, now=NOW, event=EVENT):
        return recommend_times(event, people, now)

    def test_overlap_and_timezone(self):
        r = self.result([person("A", [("14:00", "17:00")]), person("B", [("15:00", "18:00")]), person("C", [("16:00", "19:00")])])
        self.assertEqual(r["slots"][0]["start"], "2026-12-11T00:00:00+00:00")
        self.assertEqual(r["slots"][0]["availableCount"], 3)
        self.assertEqual(len(r["slots"]), 3)

    def test_touching_ranges(self):
        r = self.result([person("A", [("14:00", "14:30"), ("14:30", "15:00")])])
        self.assertEqual(r["slots"][0]["availableCount"], 1)

    def test_gap(self):
        self.assertEqual(self.result([person("A", [("14:00", "14:25"), ("14:30", "15:00")])])["slots"], [])

    def test_duplicate_ranges(self):
        r = self.result([person("A", [("14:00", "16:00"), ("14:00", "16:00")])])
        self.assertTrue(all(s["availableCount"] == 1 for s in r["slots"]))

    def test_unknown_and_empty(self):
        r = self.result([person("Free", [("14:00", "15:00")]), person("Empty", []), person("Waiting", [], False)])
        self.assertEqual(r["unknownNames"], ["Waiting"])
        self.assertEqual((r["sharedCount"], r["joinedCount"]), (2, 3))
        self.assertEqual(r["slots"][0]["unavailableNames"], ["Empty"])

    def test_empty(self):
        self.assertEqual(self.result([])["slots"], [])

    def test_past(self):
        now = datetime(2026, 12, 11, tzinfo=timezone.utc)
        r = self.result([person("A", [("14:00", "19:00")])], now)
        self.assertEqual(r["slots"][0]["start"], "2026-12-11T00:30:00+00:00")
        self.assertTrue(all(datetime.fromisoformat(s["start"]) > now for s in r["slots"]))

    def test_ties_and_window(self):
        r = self.result([person("A", [("08:00", "23:00")])])
        self.assertEqual([s["start"] for s in r["slots"]], ["2026-12-10T20:00:00+00:00", "2026-12-10T20:30:00+00:00", "2026-12-10T21:00:00+00:00"])
        self.assertEqual(self.result([person("A", [("19:30", "23:00")])])["slots"], [])

    def test_bad_legacy_data(self):
        p = person("A", [])
        p["available"] = [{"date": "2027-01-10", "start": "14:00", "end": "16:00"}, {}, None]
        self.assertEqual(self.result([p])["slots"], [])

    def test_summer_offset(self):
        event = {"month": "2026-07", "timeZone": "America/Los_Angeles"}
        p = person("A", [("14:00", "15:00")])
        p["available"][0]["date"] = "2026-07-10"
        r = self.result([p], datetime(2026, 7, 1, tzinfo=timezone.utc), event)
        self.assertEqual(r["slots"][0]["start"], "2026-07-10T21:00:00+00:00")

if __name__ == "__main__":
    unittest.main()

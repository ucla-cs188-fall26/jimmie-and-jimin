"""Group calendar tests with a fake database; no MongoDB or Google needed."""
import importlib
import json
import sys
import unittest
from datetime import datetime, timezone
from types import ModuleType, SimpleNamespace
from unittest.mock import MagicMock, patch

from django.conf import settings
from django.test import RequestFactory

if not settings.configured:
    settings.configure(DEFAULT_CHARSET="utf-8")

fake_db_module = ModuleType("api.db")
fake_db_module.db = MagicMock()
with patch.dict(sys.modules, {"api.db": fake_db_module}):
    views = importlib.import_module("api.group_calendar_views")

from api.suggestions import recommend_times  # noqa: E402

EVENT = {
    "eventId": "event-a",
    "organizerId": "1",
    "month": "2099-12",
    "timeZone": "America/Los_Angeles",
}


class SuggestionsUseCalendarTests(unittest.TestCase):
    def test_busy_time_removes_slots_for_that_person(self):
        # B is busy all of Dec 1 (12:00-20:00 PST = 20:00Z to 04:00Z).
        free = {"name": "A", "busySyncedAt": "x", "busy": []}
        busy = {
            "name": "B",
            "busySyncedAt": "x",
            "busy": [{
                "start": "2099-12-01T20:00:00+00:00",
                "end": "2099-12-02T04:00:00+00:00",
            }],
        }
        result = recommend_times(
            EVENT, [free, busy], now=datetime(2099, 11, 1, tzinfo=timezone.utc)
        )

        self.assertEqual(result["sharedCount"], 2)
        for slot in result["slots"]:
            self.assertEqual(slot["availableCount"], 2)
            self.assertFalse(slot["start"].startswith("2099-12-01T2"))

    def test_unsynced_person_is_unknown(self):
        result = recommend_times(
            EVENT,
            [{"name": "A"}],
            now=datetime(2099, 11, 1, tzinfo=timezone.utc),
        )
        self.assertEqual(result["unknownNames"], ["A"])


class BusyBlocksTests(unittest.TestCase):
    def test_only_times_are_kept(self):
        blocks = views.to_blocks([{
            "start": "2099-12-01T21:00:00Z",
            "end": "2099-12-01T23:00:00Z",
            "summary": "Secret meeting",
        }])
        self.assertEqual(
            blocks,
            [{
                "start": "2099-12-01T21:00:00+00:00",
                "end": "2099-12-01T23:00:00+00:00",
            }],
        )


class GroupCalendarViewTests(unittest.TestCase):
    def setUp(self):
        self.events = MagicMock()
        self.attendees = MagicMock()
        self.db = {"events": self.events, "attendees": self.attendees}
        patcher = patch.object(views, "db", self.db)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.events.find_one.return_value = EVENT | {"inviteToken": "t"}
        self.attendees.find.return_value = [
            {"attendeeId": "2", "name": "Jimin", "busySyncedAt": "x",
             "busy": [{"start": "a", "end": "b"}]},
            {"attendeeId": "3", "name": "Sam"},
        ]

    def get(self, pk, authenticated=True):
        request = RequestFactory().get("/api/invites/t/group-calendar")
        request.user = SimpleNamespace(is_authenticated=authenticated, pk=pk)
        return views.group_calendar(request, "t")

    def test_login_required(self):
        self.assertEqual(self.get(2, authenticated=False).status_code, 401)

    def test_outsider_denied(self):
        self.assertEqual(self.get(99).status_code, 403)

    def test_member_sees_names_and_busy_but_no_ids(self):
        response = self.get(2)
        self.assertEqual(response.status_code, 200)
        data = json.loads(response.content)
        self.assertEqual([a["name"] for a in data["attendees"]], ["Jimin", "Sam"])
        self.assertTrue(data["attendees"][0]["isYou"])
        self.assertTrue(data["attendees"][0]["synced"])
        self.assertFalse(data["attendees"][1]["synced"])
        self.assertNotIn("attendeeId", data["attendees"][0])

    def test_organizer_can_view_without_joining(self):
        self.assertEqual(self.get(1).status_code, 200)

    def test_sync_requires_joining(self):
        self.attendees.find_one.return_value = None
        request = RequestFactory().post("/api/invites/t/busy")
        request.user = SimpleNamespace(is_authenticated=True, pk=5)
        self.assertEqual(views.sync_busy(request, "t").status_code, 403)


if __name__ == "__main__":
    unittest.main()

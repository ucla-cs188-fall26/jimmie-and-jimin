"""Final-time endpoint tests with a fake database; no MongoDB needed."""
import importlib
import json
import sys
import unittest
from types import ModuleType, SimpleNamespace
from unittest.mock import MagicMock, patch

from django.conf import settings
from django.test import RequestFactory

if not settings.configured:
    settings.configure(DEFAULT_CHARSET="utf-8")

fake_db_module = ModuleType("api.db")
fake_db_module.db = MagicMock()
with patch.dict(sys.modules, {"api.db": fake_db_module}):
    view_module = importlib.import_module("api.final_time_views")

GOOD = {"start": "2026-12-05T20:00:00Z", "end": "2026-12-05T21:00:00Z"}


class FinalTimeTests(unittest.TestCase):
    def setUp(self):
        self.events = MagicMock()
        patcher = patch.object(view_module, "db", {"events": self.events})
        patcher.start()
        self.addCleanup(patcher.stop)
        self.events.find_one.return_value = {
            "eventId": "e1",
            "organizerId": "1",
        }

    def call(self, method="put", body=GOOD, pk=1, authenticated=True):
        request = getattr(RequestFactory(), method)(
            "/api/invites/t/final",
            data=json.dumps(body),
            content_type="application/json",
        )
        request.user = SimpleNamespace(is_authenticated=authenticated, pk=pk)
        return view_module.final_time(request, "t")

    def test_login_required(self):
        self.assertEqual(self.call(authenticated=False).status_code, 401)

    def test_only_organizer(self):
        self.assertEqual(self.call(pk=2).status_code, 403)
        self.events.update_one.assert_not_called()

    def test_sets_time(self):
        response = self.call()
        self.assertEqual(response.status_code, 200)
        saved = self.events.update_one.call_args[0][1]["$set"]["finalTime"]
        self.assertEqual(saved["start"], GOOD["start"])
        self.assertEqual(saved["end"], GOOD["end"])

    def test_rejects_bad_times(self):
        for body in (
            {},
            {"start": "nope", "end": "nope"},
            {"start": GOOD["end"], "end": GOOD["start"]},
            {"start": "2026-12-05T20:00:00", "end": "2026-12-05T21:00:00"},
            {"start": "2026-12-05T00:00:00Z", "end": "2026-12-07T00:00:00Z"},
        ):
            self.assertEqual(self.call(body=body).status_code, 400, body)

    def test_clear(self):
        response = self.call(method="delete", body={})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            self.events.update_one.call_args[0][1], {"$unset": {"finalTime": ""}}
        )


if __name__ == "__main__":
    unittest.main()

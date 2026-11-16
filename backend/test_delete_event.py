"""Delete-event endpoint tests with a fake database; no MongoDB needed."""
import importlib
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
    view_module = importlib.import_module("api.event_delete_views")


class DeleteEventTests(unittest.TestCase):
    def setUp(self):
        self.events = MagicMock()
        self.attendees = MagicMock()
        self.db = {"events": self.events, "attendees": self.attendees}
        patcher = patch.object(view_module, "db", self.db)
        patcher.start()
        self.addCleanup(patcher.stop)
        self.events.find_one.return_value = {
            "eventId": "event-a",
            "organizerId": "1",
        }

    def call(self, authenticated=True, pk=1, method="delete"):
        request = getattr(RequestFactory(), method)("/api/events/event-a")
        request.user = SimpleNamespace(is_authenticated=authenticated, pk=pk)
        return view_module.delete_event(request, "event-a")

    def test_login_required(self):
        self.assertEqual(self.call(authenticated=False).status_code, 401)
        self.events.delete_one.assert_not_called()

    def test_missing_event(self):
        self.events.find_one.return_value = None
        self.assertEqual(self.call().status_code, 404)
        self.events.delete_one.assert_not_called()

    def test_non_organizer_denied(self):
        self.assertEqual(self.call(pk=2).status_code, 403)
        self.events.delete_one.assert_not_called()
        self.attendees.delete_many.assert_not_called()

    def test_delete_only(self):
        self.assertEqual(self.call(method="get").status_code, 405)

    def test_organizer_deletes_event_and_attendees(self):
        self.assertEqual(self.call().status_code, 200)
        self.attendees.delete_many.assert_called_once_with({"eventId": "event-a"})
        self.events.delete_one.assert_called_once_with({"eventId": "event-a"})


if __name__ == "__main__":
    unittest.main()

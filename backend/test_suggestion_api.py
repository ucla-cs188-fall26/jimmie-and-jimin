"""Endpoint tests with a fake database; never loads MongoDB credentials."""
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
    view_module = importlib.import_module("api.suggestion_views")

class SuggestionAPITests(unittest.TestCase):
    def setUp(self):
        self.db = MagicMock()
        self.patcher = patch.object(view_module, "db", self.db)
        self.patcher.start()
        self.addCleanup(self.patcher.stop)
        self.event = {"eventId": "event-a", "organizerId": "1", "month": "2099-12", "timeZone": "America/Los_Angeles"}
        self.db.__getitem__.return_value.find_one.return_value = self.event
        self.db.__getitem__.return_value.find.return_value = []

    def call(self, authenticated=True, pk=1, method="get"):
        request = getattr(RequestFactory(), method)("/api/invites/token/suggestions")
        request.user = SimpleNamespace(is_authenticated=authenticated, pk=pk)
        return view_module.suggestions(request, "token")

    def test_login_required(self):
        self.assertEqual(self.call(False).status_code, 401)
        self.db.__getitem__.assert_not_called()

    def test_nonorganizer_denied(self):
        self.assertEqual(self.call(pk=2).status_code, 403)
        self.db.__getitem__.return_value.find.assert_not_called()

    def test_missing_invite(self):
        self.db.__getitem__.return_value.find_one.return_value = None
        self.assertEqual(self.call().status_code, 404)

    def test_get_only(self):
        self.assertEqual(self.call(method="post").status_code, 405)

    def test_owner_success_and_event_scope(self):
        response = self.call()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(json.loads(response.content)["slots"], [])
        self.db.__getitem__.return_value.find.assert_called_once_with({"eventId": "event-a"}, {"_id": 0})

if __name__ == "__main__":
    unittest.main()

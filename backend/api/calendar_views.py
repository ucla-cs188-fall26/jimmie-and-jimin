import json
import os
from datetime import datetime, timedelta, timezone

import requests
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from .db import db

TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
TIMEOUT = 10  # seconds for every call to Google

tokens = db["calendar_tokens"]


def unauthorized():
    return JsonResponse({"error": "Please log in first."}, status=401)


def parse_instant(value):
    """Parse an ISO timestamp (with a Z or offset) into an aware datetime."""
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))

    if parsed.tzinfo is None:
        raise ValueError

    return parsed


def save_tokens(user_id, payload, previous=None):
    # Google only returns a refresh token the first time a user consents,
    # so keep the stored one when a response doesn't include a new one.
    refresh = payload.get("refresh_token") or (previous or {}).get(
        "refreshToken"
    )

    expires_at = datetime.now(timezone.utc) + timedelta(
        seconds=int(payload.get("expires_in", 3600))
    )

    document = {
        "userId": user_id,
        "accessToken": payload["access_token"],
        "refreshToken": refresh,
        "expiresAt": expires_at.isoformat(),
    }

    tokens.update_one({"userId": user_id}, {"$set": document}, upsert=True)

    return document


def google_access_token(user_id):
    """Return a valid access token, refreshing it when needed.

    Returns None if the user hasn't connected, or if Google no longer
    accepts their stored permission (so they need to reconnect).
    """
    stored = tokens.find_one({"userId": user_id})

    if stored is None:
        return None

    expires_at = datetime.fromisoformat(stored["expiresAt"])

    if expires_at > datetime.now(timezone.utc) + timedelta(seconds=60):
        return stored["accessToken"]

    if not stored.get("refreshToken"):
        tokens.delete_one({"userId": user_id})
        return None

    response = requests.post(
        TOKEN_URL,
        data={
            "client_id": os.environ.get("GOOGLE_CLIENT_ID", ""),
            "client_secret": os.environ.get("GOOGLE_CLIENT_SECRET", ""),
            "refresh_token": stored["refreshToken"],
            "grant_type": "refresh_token",
        },
        timeout=TIMEOUT,
    )

    if response.status_code != 200:
        # The user revoked access, or the refresh token expired.
        tokens.delete_one({"userId": user_id})
        return None

    return save_tokens(user_id, response.json(), stored)["accessToken"]


@require_GET
def status(request):
    if not request.user.is_authenticated:
        return unauthorized()

    connected = tokens.count_documents(
        {"userId": str(request.user.pk)}
    ) > 0

    return JsonResponse({"connected": connected})


@require_POST
def connect(request):
    if not request.user.is_authenticated:
        return unauthorized()

    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")

    if not client_id or not client_secret:
        return JsonResponse(
            {"error": "Calendar is not configured on the server."},
            status=503,
        )

    try:
        code = json.loads(request.body)["code"]

        if not isinstance(code, str) or not code:
            raise ValueError
    except (ValueError, KeyError, TypeError, UnicodeDecodeError):
        return JsonResponse(
            {"error": "Expected a JSON object with a code."},
            status=400,
        )

    # Trade the one-time code for tokens. "postmessage" is the redirect
    # value Google requires for codes issued to the popup button.
    response = requests.post(
        TOKEN_URL,
        data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": "postmessage",
            "grant_type": "authorization_code",
        },
        timeout=TIMEOUT,
    )

    if response.status_code != 200:
        return JsonResponse(
            {"error": "Google rejected the calendar connection. Try again."},
            status=400,
        )

    payload = response.json()

    # The signed-in user must connect their *own* Google account: compare
    # the account in the token with the one they logged in with.
    try:
        claims = id_token.verify_oauth2_token(
            payload["id_token"],
            google_requests.Request(),
            client_id,
        )
    except (KeyError, ValueError):
        return JsonResponse(
            {"error": "Could not verify the Google account."},
            status=400,
        )

    if request.user.username != f"google_{claims['sub']}":
        return JsonResponse(
            {
                "error": (
                    "That is a different Google account from the one "
                    "you signed in with."
                )
            },
            status=403,
        )

    user_id = str(request.user.pk)
    previous = tokens.find_one({"userId": user_id})
    save_tokens(user_id, payload, previous)

    return JsonResponse({"connected": True})


@require_POST
def disconnect(request):
    if not request.user.is_authenticated:
        return unauthorized()

    user_id = str(request.user.pk)
    stored = tokens.find_one({"userId": user_id})

    if stored:
        # Best effort: tell Google to revoke it too.
        try:
            requests.post(
                REVOKE_URL,
                data={
                    "token": stored.get("refreshToken")
                    or stored["accessToken"]
                },
                timeout=TIMEOUT,
            )
        except requests.RequestException:
            pass

        tokens.delete_one({"userId": user_id})

    return JsonResponse({"connected": False})


@require_GET
def calendar_events(request):
    if not request.user.is_authenticated:
        return unauthorized()

    try:
        time_min = parse_instant(request.GET["timeMin"])
        time_max = parse_instant(request.GET["timeMax"])

        if not timedelta(0) < time_max - time_min <= timedelta(days=62):
            raise ValueError
    except (KeyError, ValueError):
        return JsonResponse(
            {
                "error": (
                    "Send timeMin and timeMax as ISO timestamps "
                    "at most 62 days apart."
                )
            },
            status=400,
        )

    access_token = google_access_token(str(request.user.pk))

    if access_token is None:
        return JsonResponse(
            {
                "error": "Connect your Google Calendar first.",
                "needsConnect": True,
            },
            status=403,
        )

    response = requests.get(
        EVENTS_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        params={
            "timeMin": time_min.isoformat(),
            "timeMax": time_max.isoformat(),
            "singleEvents": "true",  # expand recurring events
            "orderBy": "startTime",
            "maxResults": 250,
            "fields": (
                "items(id,summary,status,start,end,location,htmlLink,"
                "transparency)"
            ),
        },
        timeout=TIMEOUT,
    )

    if response.status_code in (401, 403):
        tokens.delete_one({"userId": str(request.user.pk)})
        return JsonResponse(
            {
                "error": "Google Calendar access was lost. Reconnect it.",
                "needsConnect": True,
            },
            status=403,
        )

    if response.status_code != 200:
        return JsonResponse(
            {"error": "Google Calendar is not responding. Try again."},
            status=502,
        )

    items = []

    for item in response.json().get("items", []):
        if item.get("status") == "cancelled":
            continue

        start = item.get("start", {})
        end = item.get("end", {})
        all_day = "date" in start

        items.append({
            "id": item["id"],
            "title": item.get("summary") or "(No title)",
            "start": start.get("dateTime") or start.get("date"),
            "end": end.get("dateTime") or end.get("date"),
            "allDay": all_day,
            "location": item.get("location", ""),
            "link": item.get("htmlLink", ""),
            # "transparent" events are marked Free, so they don't block time.
            "busy": item.get("transparency") != "transparent",
        })

    return JsonResponse({"events": items})

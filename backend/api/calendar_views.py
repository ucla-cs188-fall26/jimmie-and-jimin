import logging
import os
import re
import secrets
from datetime import datetime, timedelta, timezone
from urllib.parse import urlencode

import requests
from django.http import HttpResponseRedirect, JsonResponse
from django.views.decorators.http import require_GET, require_POST
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from .db import db

TOKEN_URL = "https://oauth2.googleapis.com/token"
REVOKE_URL = "https://oauth2.googleapis.com/revoke"
CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly"
EVENTS_URL = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
TIMEOUT = 10  # seconds for every call to Google

logger = logging.getLogger(__name__)

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


AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
SCOPES = f"openid email {CALENDAR_SCOPE}"


def redirect_uri(request):
    """Where Google sends the user back. Must be listed in the Google Cloud
    console under "Authorized redirect URIs". Set GOOGLE_REDIRECT_URI when
    deploying; locally it follows whatever address the browser used."""
    return os.environ.get("GOOGLE_REDIRECT_URI") or request.build_absolute_uri(
        "/api/calendar/callback"
    )


def safe_return(value):
    """Only allow going back to a page inside our own app (a #hash route)."""
    if isinstance(value, str) and re.fullmatch(r"#[\w\-/%.]{0,300}", value):
        return value

    return "#home"


def finish_connection(user, code, callback_url):
    """Trade Google's one-time code for tokens and save them.

    Returns "connected" or a short reason code for the page to explain.
    """
    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")
    client_secret = os.environ.get("GOOGLE_CLIENT_SECRET", "")

    if not client_id or not client_secret:
        return "not_configured"

    response = requests.post(
        TOKEN_URL,
        data={
            "code": code,
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": callback_url,
            "grant_type": "authorization_code",
        },
        timeout=TIMEOUT,
    )

    if response.status_code != 200:
        try:
            reason = response.json()
        except ValueError:
            reason = {}

        logger.warning(
            "Calendar connect: Google rejected the code (%s): %s",
            reason.get("error", "unknown"),
            reason.get("error_description", ""),
        )
        return "rejected"

    payload = response.json()

    if CALENDAR_SCOPE not in payload.get("scope", "").split():
        logger.warning(
            "Calendar connect: calendar scope not granted (got: %s)",
            payload.get("scope", ""),
        )
        return "no_scope"

    # The signed-in user must connect their *own* Google account.
    try:
        claims = id_token.verify_oauth2_token(
            payload["id_token"],
            google_requests.Request(),
            client_id,
        )
    except (KeyError, ValueError):
        return "rejected"

    if user.username != f"google_{claims['sub']}":
        logger.warning(
            "Calendar connect: signed in as %s but connected %s (%s)",
            user.username[:15],
            f"google_{claims['sub']}"[:15],
            claims.get("email", "?"),
        )
        return "wrong_account"

    user_id = str(user.pk)
    save_tokens(user_id, payload, tokens.find_one({"userId": user_id}))

    return "connected"


@require_GET
def start(request):
    """Send the browser to Google's permission page."""
    return_to = safe_return(request.GET.get("returnTo"))

    if not request.user.is_authenticated:
        return HttpResponseRedirect(f"/?calendar=login{return_to}")

    client_id = os.environ.get("GOOGLE_CLIENT_ID", "")

    if not client_id or not os.environ.get("GOOGLE_CLIENT_SECRET"):
        return HttpResponseRedirect(f"/?calendar=not_configured{return_to}")

    # "state" proves the user coming back is the one who started this, so
    # nobody can trick a logged-in user into connecting someone else's code.
    state = secrets.token_urlsafe(32)
    request.session["calendar_oauth"] = {"state": state, "returnTo": return_to}

    params = {
        "client_id": client_id,
        "redirect_uri": redirect_uri(request),
        "response_type": "code",
        "scope": SCOPES,
        "access_type": "offline",  # also gives us a refresh token
        "prompt": "consent",
        "state": state,
    }

    # Pre-select the account they signed in with.
    if request.user.email:
        params["login_hint"] = request.user.email

    return HttpResponseRedirect(f"{AUTH_URL}?{urlencode(params)}")


@require_GET
def callback(request):
    """Google sends the user back here with a code."""
    saved = request.session.pop("calendar_oauth", None)
    return_to = saved["returnTo"] if saved else "#home"

    if not request.user.is_authenticated or not saved:
        return HttpResponseRedirect(f"/?calendar=expired{return_to}")

    if not secrets.compare_digest(
        saved["state"], request.GET.get("state", "")
    ):
        return HttpResponseRedirect(f"/?calendar=expired{return_to}")

    code = request.GET.get("code")

    if request.GET.get("error") or not code:
        logger.warning(
            "Calendar connect: Google returned %s",
            request.GET.get("error", "no code"),
        )
        return HttpResponseRedirect(f"/?calendar=denied{return_to}")

    result = finish_connection(request.user, code, redirect_uri(request))

    return HttpResponseRedirect(f"/?calendar={result}{return_to}")


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

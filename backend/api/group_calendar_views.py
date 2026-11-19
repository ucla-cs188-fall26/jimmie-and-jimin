from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import requests
from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_POST

from .calendar_views import (
    TIMEOUT,
    google_access_token,
    parse_instant,
    tokens,
)
from .db import db

FREEBUSY_URL = "https://www.googleapis.com/calendar/v3/freeBusy"
MAX_BUSY_BLOCKS = 500


def month_range(event):
    """The event month as UTC instants, measured in the event's time zone."""
    zone = ZoneInfo(event["timeZone"])
    year, month = map(int, event["month"].split("-"))

    first = datetime(year, month, 1, tzinfo=zone)
    following = datetime(
        year + (month == 12),
        month % 12 + 1,
        1,
        tzinfo=zone,
    )

    return first.astimezone(timezone.utc), following.astimezone(timezone.utc)


def to_blocks(busy):
    """Keep only start/end times. Nothing about what the event is."""
    blocks = []

    for item in busy:
        start = parse_instant(item["start"]).astimezone(timezone.utc)
        end = parse_instant(item["end"]).astimezone(timezone.utc)

        if end > start:
            blocks.append({
                "start": start.isoformat(),
                "end": end.isoformat(),
            })

    blocks.sort(key=lambda block: block["start"])

    return blocks[:MAX_BUSY_BLOCKS]


@require_POST
def sync_busy(request, token):
    if not request.user.is_authenticated:
        return JsonResponse(
            {"error": "Please log in first."},
            status=401,
        )

    event = db["events"].find_one({"inviteToken": token})

    if event is None:
        return JsonResponse(
            {"error": "Invite not found."},
            status=404,
        )

    membership = {
        "eventId": event["eventId"],
        "attendeeId": str(request.user.pk),
    }

    if db["attendees"].find_one(membership) is None:
        return JsonResponse(
            {"error": "Join the event before syncing your calendar."},
            status=403,
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

    time_min, time_max = month_range(event)

    # The free/busy API only ever returns when someone is busy, never the
    # titles, places or guests of their events.
    response = requests.post(
        FREEBUSY_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        json={
            "timeMin": time_min.isoformat(),
            "timeMax": time_max.isoformat(),
            "items": [{"id": "primary"}],
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

    try:
        calendar = response.json()["calendars"]["primary"]

        if calendar.get("errors"):
            raise ValueError

        blocks = to_blocks(calendar.get("busy", []))
    except (KeyError, ValueError, TypeError):
        return JsonResponse(
            {"error": "Could not read your calendar. Try again."},
            status=502,
        )

    synced_at = datetime.now(timezone.utc).isoformat()

    db["attendees"].update_one(
        membership,
        {"$set": {"busy": blocks, "busySyncedAt": synced_at}},
    )

    return JsonResponse({
        "busy": blocks,
        "syncedAt": synced_at,
    })


@require_GET
def group_calendar(request, token):
    if not request.user.is_authenticated:
        return JsonResponse(
            {"error": "Please log in first."},
            status=401,
        )

    event = db["events"].find_one({"inviteToken": token})

    if event is None:
        return JsonResponse(
            {"error": "Invite not found."},
            status=404,
        )

    me = str(request.user.pk)
    attendees = list(db["attendees"].find({"eventId": event["eventId"]}))

    # Only people in the event (the organizer or someone who joined) can
    # see the group's calendar.
    is_member = (
        event.get("organizerId") == me
        or any(person.get("attendeeId") == me for person in attendees)
    )

    if not is_member:
        return JsonResponse(
            {"error": "Join this event to see the group calendar."},
            status=403,
        )

    return JsonResponse({
        "month": event["month"],
        "timeZone": event["timeZone"],
        "attendees": [
            {
                "name": person.get("name", "Someone"),
                "busy": person.get("busy") or [],
                "synced": bool(person.get("busySyncedAt")),
                "isYou": person.get("attendeeId") == me,
            }
            for person in attendees
        ],
    })

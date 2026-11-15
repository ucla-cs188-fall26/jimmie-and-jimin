import json
import re
from datetime import date, datetime, timezone

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from .db import db


@require_http_methods(["GET", "PUT"])
def availability(request, token):
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

    attendee = db["attendees"].find_one(membership)

    if request.method == "GET":
        return JsonResponse({
            "name": attendee["name"] if attendee else "",
            "available": attendee.get("available", []) if attendee else [],
            "sharedAt": attendee.get("sharedAt") if attendee else None,
        })

    if attendee is None:
        return JsonResponse(
            {"error": "Join the event before saving availability."},
            status=403,
        )

    try:
        data = json.loads(request.body)

        if not isinstance(data, dict):
            raise ValueError

        available = data.get("available")

        if not isinstance(available, list) or len(available) > 100:
            raise ValueError

        cleaned = []

        for block in available:
            if not isinstance(block, dict):
                raise ValueError

            day = block.get("date")
            start = block.get("start")
            end = block.get("end")

            if not all(isinstance(v, str) for v in [day, start, end]):
                raise ValueError

            if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", day):
                raise ValueError

            date.fromisoformat(day)

            if day[:7] != event["month"]:
                raise ValueError

            for value in [start, end]:
                if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", value):
                    raise ValueError

            if end <= start:
                raise ValueError

            cleaned.append({
                "date": day,
                "start": start,
                "end": end,
            })

    except (ValueError, UnicodeDecodeError):
        return JsonResponse(
            {
                "error": (
                    "Choose valid dates within the event month. "
                    "End times must be later than start times. "
                    "Use at most 100 time ranges."
                )
            },
            status=400,
        )

    cleaned.sort(key=lambda block: (block["date"], block["start"]))
    shared_at = datetime.now(timezone.utc).isoformat()

    db["attendees"].update_one(
        membership,
        {
            "$set": {
                "available": cleaned,
                "availabilityTimeZone": event["timeZone"],
                "sharedAt": shared_at,
            }
        },
    )

    return JsonResponse({
        "available": cleaned,
        "sharedAt": shared_at,
    })
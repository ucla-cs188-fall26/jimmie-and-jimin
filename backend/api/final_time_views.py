import json
from datetime import datetime, timedelta, timezone

from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from .db import db


def parse_instant(value):
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))

    if parsed.tzinfo is None:
        raise ValueError

    return parsed.astimezone(timezone.utc)


def iso(value):
    return value.strftime("%Y-%m-%dT%H:%M:%SZ")


@require_http_methods(["PUT", "DELETE"])
def final_time(request, token):
    """PUT sets (or changes) the event's chosen time; DELETE clears it.

    Only the organizer can do either. Everyone with the invite link sees the
    result through the normal invite details.
    """
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Please log in first."}, status=401)

    event = db["events"].find_one({"inviteToken": token})

    if event is None:
        return JsonResponse({"error": "Invite not found."}, status=404)

    if event.get("organizerId") != str(request.user.pk):
        return JsonResponse(
            {"error": "Only the organizer can choose the final time."},
            status=403,
        )

    if request.method == "DELETE":
        db["events"].update_one(
            {"eventId": event["eventId"]}, {"$unset": {"finalTime": ""}}
        )
        return JsonResponse({"finalTime": None})

    try:
        body = json.loads(request.body or b"{}")
        start = parse_instant(body["start"])
        end = parse_instant(body["end"])

        if not timedelta(0) < end - start <= timedelta(hours=24):
            raise ValueError
    except (KeyError, TypeError, ValueError, AttributeError):
        return JsonResponse(
            {
                "error": (
                    "Send start and end as ISO timestamps, "
                    "at most 24 hours apart."
                )
            },
            status=400,
        )

    chosen = {
        "start": iso(start),
        "end": iso(end),
        "finalizedAt": iso(datetime.now(timezone.utc)),
    }

    db["events"].update_one(
        {"eventId": event["eventId"]}, {"$set": {"finalTime": chosen}}
    )

    return JsonResponse({"finalTime": chosen})

import json
import re
import secrets
import uuid
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.http import (
    require_GET,
    require_http_methods,
)

from .db import db


@require_GET
def health(request):
    return JsonResponse({
        "message": "Backend is working!"
    })


@require_GET
def csrf(request):
    return JsonResponse({
        "csrfToken": get_token(request)
    })


@require_http_methods(["GET", "POST"])
def events(request):
    # Require an account to list or create events.
    if not request.user.is_authenticated:
        return JsonResponse(
            {"error": "Please log in first."},
            status=401,
        )

    organizer_id = str(request.user.pk)

    # GET: return only this organizer's events.
    if request.method == "GET":
        saved_events = list(
            db["events"].find(
                {"organizerId": organizer_id},
                {"_id": 0},
            )
        )

        return JsonResponse(saved_events, safe=False)

    # POST: read the submitted event.
    try:
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        return JsonResponse(
            {"error": "Invalid JSON."},
            status=400,
        )

    if not isinstance(data, dict):
        return JsonResponse(
            {"error": "Expected a JSON object."},
            status=400,
        )

    fields = ["name", "description", "month", "timeZone"]

    if any(
        not isinstance(data.get(field), str)
        for field in fields
    ):
        return JsonResponse(
            {
                "error": (
                    "name, description, month and timeZone "
                    "must be strings."
                )
            },
            status=400,
        )

    name = data["name"].strip()
    description = data["description"].strip()

    if not 1 <= len(name) <= 100:
        return JsonResponse(
            {"error": "Event name must be 1–100 characters."},
            status=400,
        )

    if len(description) > 1000:
        return JsonResponse(
            {"error": "Description must be at most 1000 characters."},
            status=400,
        )

    try:
        if not re.fullmatch(r"\d{4}-\d{2}", data["month"]):
            raise ValueError

        datetime.strptime(data["month"], "%Y-%m")
        ZoneInfo(data["timeZone"])

    except (ValueError, ZoneInfoNotFoundError):
        return JsonResponse(
            {
                "error": (
                    "Use a valid YYYY-MM month "
                    "and IANA time zone."
                )
            },
            status=400,
        )

    event = {
        "eventId": str(uuid.uuid4()),
        "organizerId": organizer_id,
        "name": name,
        "description": description,
        "month": data["month"],
        "timeZone": data["timeZone"],
        "inviteToken": secrets.token_urlsafe(24),
    }

    db["events"].insert_one(event.copy())

    return JsonResponse(event, status=201)


@require_GET
def invite_details(request, token):
    # Anyone with the invite link can read event details.
    event = db["events"].find_one(
        {"inviteToken": token},
        {"_id": 0, "organizerId": 0},
    )

    if event is None:
        return JsonResponse(
            {"error": "Invite not found."},
            status=404,
        )

    return JsonResponse(event)


@require_GET
def event_dashboard(request, token):
    if not request.user.is_authenticated:
        return JsonResponse(
            {"error": "Please log in first."},
            status=401,
        )

    event = db["events"].find_one({
        "inviteToken": token
    })

    if event is None:
        return JsonResponse(
            {"error": "Invite not found."},
            status=404,
        )

    # Only the event's organizer can view the dashboard.
    if event.get("organizerId") != str(request.user.pk):
        return JsonResponse(
            {"error": "Only the organizer can view this dashboard."},
            status=403,
        )

    attendees = list(
        db["attendees"].find(
            {"eventId": event["eventId"]},
            {"_id": 0},
        )
    )

    return JsonResponse({
        "attendees": attendees
    })


@require_http_methods(["PUT"])
def join_event(request, token):
    if not request.user.is_authenticated:
        return JsonResponse(
            {"error": "Please log in before joining."},
            status=401,
        )

    event = db["events"].find_one({
        "inviteToken": token
    })

    if event is None:
        return JsonResponse(
            {"error": "Invite not found."},
            status=404,
        )

    try:
        data = json.loads(request.body)
    except (ValueError, UnicodeDecodeError):
        return JsonResponse(
            {"error": "Invalid JSON."},
            status=400,
        )

    if not isinstance(data, dict):
        return JsonResponse(
            {"error": "Expected a JSON object."},
            status=400,
        )

    name = data.get("name")

    if (
        not isinstance(name, str)
        or not 1 <= len(name.strip()) <= 60
    ):
        return JsonResponse(
            {"error": "Name must be 1–60 characters."},
            status=400,
        )

    # Use the account ID instead of a temporary guest ID.
    membership = {
        "eventId": event["eventId"],
        "attendeeId": str(request.user.pk),
    }

    db["attendees"].update_one(
        membership,
        {
            "$set": {
                "name": name.strip(),
            },
            "$setOnInsert": {
                "sharedAt": None,
                "busy": [],
            },
        },
        upsert=True,
    )

    attendee = db["attendees"].find_one(
        membership,
        {"_id": 0},
    )

    return JsonResponse(attendee)

@require_GET
def event_slots(request, token):
    event = db["events"].find_one({"inviteToken": token})

    if event is None:
        return JsonResponse(
            {"error": "Invite not found."},
            status=404,
        )

    event_filter = {"eventId": event["eventId"]}

    joined_count = db["attendees"].count_documents(event_filter)

    shared_count = db["attendees"].count_documents({
        **event_filter,
        "sharedAt": {"$ne": None},
    })

    return JsonResponse({
        "slots": [],
        "joinedCount": joined_count,
        "sharedCount": shared_count,
    })
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from .db import db


@require_GET
def joined_events(request):
    if not request.user.is_authenticated:
        return JsonResponse(
            {"error": "Please log in first."},
            status=401,
        )

    event_ids = db["attendees"].distinct(
        "eventId",
        {"attendeeId": str(request.user.pk)},
    )

    saved_events = list(
        db["events"].find(
            {"eventId": {"$in": event_ids}},
            {"_id": 0, "organizerId": 0},
        )
    )

    return JsonResponse(saved_events, safe=False)
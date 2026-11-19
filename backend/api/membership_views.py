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

    user_id = str(request.user.pk)

    event_ids = db["attendees"].distinct(
        "eventId",
        {"attendeeId": user_id},
    )

    saved_events = list(
        db["events"].find(
            # Events you organize are listed under "Organizing", not here.
            {
                "eventId": {"$in": event_ids},
                "organizerId": {"$ne": user_id},
            },
            {"_id": 0, "organizerId": 0},
        )
    )

    return JsonResponse(saved_events, safe=False)
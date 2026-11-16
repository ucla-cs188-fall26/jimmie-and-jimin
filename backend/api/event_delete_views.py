from django.http import JsonResponse
from django.views.decorators.http import require_http_methods

from .db import db


@require_http_methods(["DELETE"])
def delete_event(request, event_id):
    if not request.user.is_authenticated:
        return JsonResponse(
            {"error": "Please log in first."},
            status=401,
        )

    event = db["events"].find_one({"eventId": event_id})

    if event is None:
        return JsonResponse(
            {"error": "Event not found."},
            status=404,
        )

    # Only the organizer can delete their event.
    if event.get("organizerId") != str(request.user.pk):
        return JsonResponse(
            {"error": "Only the organizer can delete this event."},
            status=403,
        )

    # Remove the attendees' responses first, then the event itself, so a
    # failure part-way never leaves attendees pointing at a missing event.
    db["attendees"].delete_many({"eventId": event_id})
    db["events"].delete_one({"eventId": event_id})

    return JsonResponse({"deleted": True})

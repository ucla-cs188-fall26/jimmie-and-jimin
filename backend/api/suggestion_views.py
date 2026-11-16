from django.http import JsonResponse
from django.views.decorators.http import require_GET

from .db import db
from .suggestions import recommend_times


@require_GET
def suggestions(request, token):
    if not request.user.is_authenticated:
        return JsonResponse({"error": "Please log in first."}, status=401)
    event = db["events"].find_one({"inviteToken": token})
    if event is None:
        return JsonResponse({"error": "Invite not found."}, status=404)
    # Match the existing dashboard's server-side ownership check.
    if event.get("organizerId") != str(request.user.pk):
        return JsonResponse(
            {"error": "Only the organizer can view suggested times."}, status=403
        )
    attendees = list(db["attendees"].find(
        {"eventId": event["eventId"]}, {"_id": 0}
    ))
    return JsonResponse(recommend_times(event, attendees))

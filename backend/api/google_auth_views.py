import json
import os

from django.contrib.auth import get_user_model, login
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.http import require_GET, require_POST
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from .auth_views import user_details
from .db import db  # noqa: F401  (importing db also loads backend/.env)


def google_client_id():
    return os.environ.get("GOOGLE_CLIENT_ID", "")


@require_GET
def auth_config(request):
    # The client ID is public; the frontend needs it to render the button.
    return JsonResponse({"googleClientId": google_client_id()})


@require_POST
def google_login(request):
    client_id = google_client_id()

    if not client_id:
        return JsonResponse(
            {"error": "Google sign-in is not configured on the server."},
            status=503,
        )

    try:
        data = json.loads(request.body)
        credential = data["credential"]

        if not isinstance(credential, str):
            raise ValueError
    except (ValueError, KeyError, TypeError, UnicodeDecodeError):
        return JsonResponse(
            {"error": "Expected a JSON object with a credential."},
            status=400,
        )

    try:
        # Checks the signature, expiry, issuer and audience (our client ID).
        claims = id_token.verify_oauth2_token(
            credential,
            google_requests.Request(),
            client_id,
        )
    except ValueError:
        return JsonResponse(
            {"error": "Invalid Google sign-in. Please try again."},
            status=401,
        )

    if not claims.get("email_verified"):
        return JsonResponse(
            {"error": "Your Google email address is not verified."},
            status=401,
        )

    # "sub" is Google's stable account ID. Key on it, never on email, so a
    # password account that happens to use the same text can't be taken over.
    User = get_user_model()
    user, created = User.objects.get_or_create(
        username=f"google_{claims['sub']}",
        defaults={
            "email": claims.get("email", ""),
            "first_name": (claims.get("name") or "")[:150],
        },
    )

    if created:
        user.set_unusable_password()
        user.save()

    login(
        request,
        user,
        backend="django.contrib.auth.backends.ModelBackend",
    )

    return JsonResponse(
        {
            "user": user_details(user),
            "csrfToken": get_token(request),
        },
        status=201 if created else 200,
    )

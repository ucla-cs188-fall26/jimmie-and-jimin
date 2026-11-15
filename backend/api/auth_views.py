import json

from django.contrib.auth import login, logout
from django.contrib.auth.forms import (
    AuthenticationForm,
    UserCreationForm,
)
from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.http import require_GET, require_POST


def read_json(request):
    data = json.loads(request.body)

    if not isinstance(data, dict):
        raise ValueError

    if any(not isinstance(value, str) for value in data.values()):
        raise ValueError

    return data


def user_details(user):
    return {
        "userId": str(user.pk),
        "username": user.username,
    }


@require_POST
def signup(request):
    try:
        data = read_json(request)
    except (ValueError, UnicodeDecodeError):
        return JsonResponse(
            {"error": "Expected a JSON object with string values."},
            status=400,
        )

    form = UserCreationForm(data=data)

    if not form.is_valid():
        return JsonResponse(
            {"errors": form.errors.get_json_data()},
            status=400,
        )

    user = form.save()

    # Automatically log in after creating the account.
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
        status=201,
    )


@require_POST
def signin(request):
    try:
        data = read_json(request)
    except (ValueError, UnicodeDecodeError):
        return JsonResponse(
            {"error": "Expected a JSON object with string values."},
            status=400,
        )

    form = AuthenticationForm(request=request, data=data)

    if not form.is_valid():
        return JsonResponse(
            {"error": "Invalid username or password."},
            status=401,
        )

    user = form.get_user()
    login(request, user)

    return JsonResponse({
        "user": user_details(user),
        "csrfToken": get_token(request),
    })


@require_POST
def signout(request):
    logout(request)

    return JsonResponse({
        "user": None,
        "csrfToken": get_token(request),
    })


@require_GET
def me(request):
    user = (
        user_details(request.user)
        if request.user.is_authenticated
        else None
    )

    return JsonResponse({"user": user})
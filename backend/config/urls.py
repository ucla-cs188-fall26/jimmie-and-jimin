from django.contrib import admin
from django.urls import path

from api import auth_views, google_auth_views
from api.availability_views import availability
from api.membership_views import joined_events
from api.views import (
    health,
    csrf,
    events,
    invite_details,
    event_dashboard,
    event_slots,
    join_event,
)

urlpatterns = [
    path("admin/", admin.site.urls),

    path("api/health", health),
    path("api/csrf", csrf),

    path("api/events", events),
    path("api/events/joined", joined_events),

    path(
        "api/invites/<str:token>",
        invite_details,
    ),
    path(
        "api/invites/<str:token>/dashboard",
        event_dashboard,
    ),
    path(
        "api/invites/<str:token>/slots",
        event_slots,
    ),
    path(
        "api/invites/<str:token>/join",
        join_event,
    ),
    path(
        "api/invites/<str:token>/availability",
        availability,
    ),

    path("api/auth/config", google_auth_views.auth_config),
    path("api/auth/google", google_auth_views.google_login),
    path("api/auth/signup", auth_views.signup),
    path("api/auth/login", auth_views.signin),
    path("api/auth/logout", auth_views.signout),
    path("api/auth/me", auth_views.me),
]
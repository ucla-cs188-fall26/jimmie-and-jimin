import json
from http.cookiejar import CookieJar
from urllib.request import (
    Request,
    build_opener,
    HTTPCookieProcessor,
)

browser = build_opener(HTTPCookieProcessor(CookieJar()))

# Get the CSRF token and keep its cookie.
with browser.open("http://localhost:8000/api/csrf") as response:
    token = json.load(response)["csrfToken"]

event = {
    "name": "Game Night",
    "description": "Our first event saved in MongoDB!",
    "month": "2026-12",
    "timeZone": "America/Los_Angeles",
}

request = Request(
    "http://localhost:8000/api/events",
    data=json.dumps(event).encode("utf-8"),
    headers={
        "Content-Type": "application/json",
        "X-CSRFToken": token,
    },
    method="POST",
)

with browser.open(request) as response:
    print("Status:", response.status)
    print(json.dumps(json.load(response), indent=2))
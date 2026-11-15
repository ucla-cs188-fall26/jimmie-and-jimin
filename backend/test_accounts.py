import getpass
import json
from http.cookiejar import CookieJar
from urllib.error import HTTPError
from urllib.request import (
    Request,
    build_opener,
    HTTPCookieProcessor,
)

BASE = "http://localhost:8000"
browser = build_opener(HTTPCookieProcessor(CookieJar()))


def get(path):
    with browser.open(BASE + path) as response:
        return json.load(response)


def post(path, data):
    token = get("/api/csrf")["csrfToken"]

    request = Request(
        BASE + path,
        data=json.dumps(data).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "X-CSRFToken": token,
        },
        method="POST",
    )

    with browser.open(request) as response:
        return json.load(response)


username = input("Choose a new username: ").strip()
password = getpass.getpass("Choose a password: ")
confirmation = getpass.getpass("Confirm password: ")

try:
    result = post("/api/auth/signup", {
        "username": username,
        "password1": password,
        "password2": confirmation,
    })
    print("Signed up:", result["user"])
    print("Account status:", get("/api/auth/me"))

    post("/api/auth/logout", {})
    print("After logout:", get("/api/auth/me"))

    result = post("/api/auth/login", {
        "username": username,
        "password": password,
    })
    print("Logged back in:", result["user"])

except HTTPError as error:
    print("Request failed:", error.code)
    print(error.read().decode())
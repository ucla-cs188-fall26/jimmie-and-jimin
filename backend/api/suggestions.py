"""Pure scheduling logic; availability uses local dates/times in the event zone."""
import calendar
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo


def _instant(day, clock, zone):
    local = datetime.combine(day, time.fromisoformat(clock)).replace(tzinfo=zone)
    utc = local.astimezone(timezone.utc)
    # Ignore nonexistent local times during a clock change.
    if utc.astimezone(zone).replace(tzinfo=None) != local.replace(tzinfo=None):
        raise ValueError("Nonexistent local time")
    return utc


def _ranges(person, month, zone):
    ranges = []
    for block in person.get("available", []):
        try:
            day = date.fromisoformat(block["date"])
            if day.strftime("%Y-%m") != month:
                continue
            start = _instant(day, block["start"], zone)
            end = _instant(day, block["end"], zone)
            if end > start:
                ranges.append((start, end))
        except (KeyError, ValueError, TypeError):
            continue
    merged = []
    for start, end in sorted(ranges):
        if merged and start <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(end, merged[-1][1]))
        else:
            merged.append((start, end))
    return merged


def _busy_ranges(person):
    """Busy blocks synced from a person's Google Calendar (UTC instants)."""
    ranges = []
    for block in person.get("busy") or []:
        try:
            start = datetime.fromisoformat(block["start"])
            end = datetime.fromisoformat(block["end"])
            if start.tzinfo and end.tzinfo and end > start:
                ranges.append((start, end))
        except (KeyError, ValueError, TypeError):
            continue
    return ranges


def _typed_availability(person):
    return bool(person.get("sharedAt") and isinstance(person.get("available"), list))


def _synced_calendar(person):
    return bool(person.get("busySyncedAt"))


def recommend_times(event, attendees, now=None):
    """Top 3 future hours, half-hour grid, noon–8 PM; unknown != unavailable."""
    zone = ZoneInfo(event["timeZone"])
    month = event["month"]
    first = date.fromisoformat(month + "-01")
    now = now or datetime.now(timezone.utc)
    if now.tzinfo is None:
        raise ValueError("now must include a time zone")
    # Someone has responded if they typed their availability or synced their
    # calendar. A synced calendar means "free except when busy".
    submitted = [p for p in attendees
                 if _typed_availability(p) or _synced_calendar(p)]
    unknown = [p.get("name", "Unnamed participant") for p in attendees
               if not (_typed_availability(p) or _synced_calendar(p))]
    prepared = [(p.get("name", "Unnamed participant"),
                 _ranges(p, month, zone) if _typed_availability(p) else None,
                 _busy_ranges(p))
                for p in submitted]
    candidates = []
    for day_number in range(1, calendar.monthrange(first.year, first.month)[1] + 1):
        day = first.replace(day=day_number)
        for minute in range(12 * 60, 19 * 60 + 1, 30):
            clock = f"{minute // 60:02}:{minute % 60:02}"
            try:
                start = _instant(day, clock, zone)
            except ValueError:
                continue
            end = start + timedelta(hours=1)
            if start <= now:
                continue
            available, unavailable = [], []
            for name, ranges, busy in prepared:
                covered = (
                    (ranges is None or any(a <= start and b >= end for a, b in ranges))
                    and not any(a < end and b > start for a, b in busy)
                )
                (available if covered else unavailable).append(name)
            if available:
                candidates.append({
                    "start": start.isoformat(), "end": end.isoformat(),
                    "availableCount": len(available),
                    "availableNames": available, "unavailableNames": unavailable,
                })
    candidates.sort(key=lambda s: (-s["availableCount"], s["start"]))
    return {
        "slots": candidates[:3], "joinedCount": len(attendees),
        "sharedCount": len(submitted), "unknownNames": unknown,
        "timeZone": event["timeZone"], "durationMinutes": 60,
        "searchStart": "12:00", "searchEnd": "20:00", "stepMinutes": 30,
    }

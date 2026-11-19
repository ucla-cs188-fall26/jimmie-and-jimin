import { useEffect, useState } from 'react';

import {
  startCalendarConnect,
  takeCalendarResult,
} from '../lib/calendarConnect.js';
import { api } from '../services/api.js';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_CHIPS = 3;

function dayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

// All-day events use plain dates ("2026-11-20"): read them as local days.
function parseStart(event) {
  if (!event.allDay) return new Date(event.start);
  const [y, m, d] = event.start.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function parseEnd(event) {
  if (!event.allDay) return new Date(event.end);
  const [y, m, d] = event.end.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// Every local day an event touches. Event ends are exclusive, so an event
// ending exactly at midnight doesn't spill onto the next day.
function daysOf(event) {
  const start = parseStart(event);
  const end = parseEnd(event);
  const days = [];

  const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());

  do {
    days.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  } while (cursor < end && days.length < 62);

  return days;
}

function timeLabel(event) {
  if (event.allDay) return 'All day';

  const format = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });

  return `${format.format(parseStart(event))} – ${format.format(parseEnd(event))}`;
}

function shortTime(event) {
  if (event.allDay) return '';

  return new Intl.DateTimeFormat('en-US', { hour: 'numeric' })
    .format(parseStart(event))
    .replace(' ', '')
    .toLowerCase();
}

export default function CalendarPanel() {
  const today = new Date();

  const [connected, setConnected] = useState(null); // null = still checking
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-11
  const [events, setEvents] = useState([]);
  const [selected, setSelected] = useState(dayKey(today));
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // Show the result when Google sends the user back here.
  useEffect(() => {
    const result = takeCalendarResult();

    if (result?.ok) setNotice(result.message);
    else if (result) setError(result.message);
  }, []);

  useEffect(() => {
    let ignore = false;

    api.calendarStatus()
      .then((result) => {
        if (!ignore) setConnected(result.connected);
      })
      .catch((err) => {
        if (!ignore) {
          setConnected(false);
          setError(err.message);
        }
      });

    return () => {
      ignore = true;
    };
  }, []);

  useEffect(() => {
    if (!connected) return undefined;

    let ignore = false;
    setLoading(true);
    setError('');

    // Month boundaries in the viewer's own time zone.
    const first = new Date(year, month, 1);
    const next = new Date(year, month + 1, 1);

    api.calendarEvents(first.toISOString(), next.toISOString())
      .then((result) => {
        if (!ignore) setEvents(result.events);
      })
      .catch((err) => {
        if (ignore) return;

        setEvents([]);
        setError(err.message);

        // Google access was lost (e.g. revoked): ask to reconnect.
        if (/Reconnect|Connect your Google/.test(err.message)) {
          setConnected(false);
        }
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [connected, year, month]);

  function connect() {
    setBusy(true);
    startCalendarConnect('#home');
  }

  async function disconnect() {
    setBusy(true);
    setError('');

    try {
      await api.calendarDisconnect();
      setConnected(false);
      setEvents([]);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function shiftMonth(delta) {
    const moved = new Date(year, month + delta, 1);
    setYear(moved.getFullYear());
    setMonth(moved.getMonth());
  }

  // Group events by the local day(s) they fall on.
  const byDay = {};

  for (const event of events) {
    for (const key of daysOf(event)) {
      (byDay[key] ||= []).push(event);
    }
  }

  const title = new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, month, 1));

  const offset = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayKey = dayKey(today);
  const selectedEvents = byDay[selected] || [];

  return (
    <section className="panel cal-panel" style={{ marginBottom: 24 }}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">YOUR GOOGLE CALENDAR</span>
          <h2>{connected ? title : 'Your calendar'}</h2>
        </div>

        {connected && (
          <div className="button-row">
            <button
              type="button"
              className="secondary"
              onClick={() => shiftMonth(-1)}
              aria-label="Previous month"
            >
              ←
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setYear(today.getFullYear());
                setMonth(today.getMonth());
                setSelected(todayKey);
              }}
            >
              Today
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => shiftMonth(1)}
              aria-label="Next month"
            >
              →
            </button>
          </div>
        )}
      </div>

      {notice && <p className="success" role="status">{notice}</p>}
      {error && <p className="error" role="alert">{error}</p>}

      {connected === null ? (
        <p role="status">Checking your calendar…</p>
      ) : !connected ? (
        <div>
          <p>
            Connect Google Calendar to see your schedule here. We only
            request read-only access.
          </p>
          <button type="button" onClick={connect} disabled={busy}>
            {busy ? 'Connecting…' : 'Connect Google Calendar'}
          </button>
        </div>
      ) : (
        <>
          <div className="cal-grid" aria-busy={loading}>
            {WEEKDAYS.map((day) => (
              <span className="weekday" key={day}>{day}</span>
            ))}

            {Array.from({ length: offset }, (_, i) => (
              <span key={`empty-${i}`} />
            ))}

            {Array.from({ length: daysInMonth }, (_, i) => {
              const day = i + 1;
              const key = dayKey(new Date(year, month, day));
              const dayEvents = byDay[key] || [];

              return (
                <button
                  type="button"
                  key={key}
                  className={[
                    'cal-cell',
                    key === todayKey ? 'today' : '',
                    key === selected ? 'selected' : '',
                  ].join(' ')}
                  aria-pressed={key === selected}
                  aria-label={`${key}, ${dayEvents.length} events`}
                  onClick={() => setSelected(key)}
                >
                  <span className="cal-date">{day}</span>

                  {dayEvents.slice(0, MAX_CHIPS).map((event) => (
                    <span
                      key={event.id}
                      className={`cal-chip ${event.busy ? '' : 'free'}`}
                    >
                      {shortTime(event)} {event.title}
                    </span>
                  ))}

                  {dayEvents.length > MAX_CHIPS && (
                    <span className="cal-more">
                      +{dayEvents.length - MAX_CHIPS} more
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {loading && <p role="status" className="small">Loading…</p>}

          <div className="cal-day-list">
            <h3>
              {new Intl.DateTimeFormat('en-US', {
                weekday: 'long',
                month: 'long',
                day: 'numeric',
              }).format(new Date(`${selected}T12:00:00`))}
            </h3>

            {selectedEvents.length === 0 ? (
              <p className="small">Nothing scheduled.</p>
            ) : (
              <ul>
                {selectedEvents.map((event) => (
                  <li key={event.id}>
                    <strong>{event.title}</strong>
                    <small>
                      {timeLabel(event)}
                      {event.location ? ` · ${event.location}` : ''}
                      {event.busy ? '' : ' · Free'}
                    </small>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            className="text-button"
            onClick={disconnect}
            disabled={busy}
          >
            Disconnect Google Calendar
          </button>
        </>
      )}
    </section>
  );
}

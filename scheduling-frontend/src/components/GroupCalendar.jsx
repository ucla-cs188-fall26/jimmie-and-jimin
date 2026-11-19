import { useEffect, useMemo, useState } from 'react';

import { api } from '../services/api.js';
import { monthLabel } from '../lib/dates.js';

const START_HOUR = 7;
const END_HOUR = 23;
const ROW = 36; // pixels per hour
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// One color per person. Free time stays plain white.
const COLORS = [
  '#2f7d57', '#d2691e', '#3b6fb6', '#8a5cb8',
  '#1f8a8a', '#c0507a', '#b08900', '#5a6b7b',
];

const pad = (n) => String(n).padStart(2, '0');

// A moment, as the date and minutes-since-midnight in the event's zone.
function inZone(instant, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(instant))
      .map((p) => [p.type, p.value]),
  );

  return {
    day: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function nextDay(day) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

// Split a busy block into one piece per day it touches.
function segments(block, timeZone) {
  const start = inZone(block.start, timeZone);
  const end = inZone(block.end, timeZone);
  const pieces = [];

  let day = start.day;
  let from = start.minutes;

  for (let guard = 0; guard < 40; guard += 1) {
    const last = day === end.day;
    pieces.push({ day, from, to: last ? end.minutes : 24 * 60 });

    if (last) break;
    day = nextDay(day);
    from = 0;
  }

  return pieces.filter((p) => p.to > p.from);
}

function weeksOf(month) {
  const [year, m] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, m - 1, 1, 12));
  const last = new Date(Date.UTC(year, m, 0, 12));
  const cursor = new Date(first);
  cursor.setUTCDate(cursor.getUTCDate() - cursor.getUTCDay());

  const weeks = [];

  while (cursor <= last) {
    const days = [];

    for (let i = 0; i < 7; i += 1) {
      days.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    weeks.push(days);
  }

  return weeks;
}

function clock(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h % 12 || 12}${m ? `:${pad(m)}` : ''} ${h >= 12 && h < 24 ? 'PM' : 'AM'}`;
}

export default function GroupCalendar({ token, refreshKey }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [week, setWeek] = useState(0);

  useEffect(() => {
    let ignore = false;

    api.getGroupCalendar(token)
      .then((result) => {
        if (ignore) return;
        setData(result);
        setError('');
      })
      .catch((err) => {
        if (!ignore) setError(err.message);
      });

    return () => {
      ignore = true;
    };
  }, [token, refreshKey]);

  const weeks = useMemo(() => (data ? weeksOf(data.month) : []), [data]);

  // Start on the current week when it falls inside the event's month.
  useEffect(() => {
    if (!weeks.length) return;
    const today = new Date().toISOString().slice(0, 10);
    const index = weeks.findIndex((days) => days.includes(today));
    setWeek(index >= 0 ? index : 0);
  }, [weeks]);

  if (error) {
    // Not part of the event yet: show nothing rather than an error.
    return /Join this event/.test(error)
      ? null
      : <p className="error" role="alert">{error}</p>;
  }

  if (!data) return null;

  const people = data.attendees.map((person, index) => ({
    ...person,
    color: COLORS[index % COLORS.length],
  }));

  const days = weeks[week] || [];
  const lane = 100 / Math.max(people.length, 1);
  const hours = Array.from(
    { length: END_HOUR - START_HOUR },
    (_, i) => START_HOUR + i,
  );

  // day -> list of drawn blocks
  const byDay = {};

  people.forEach((person, index) => {
    for (const block of person.busy) {
      for (const piece of segments(block, data.timeZone)) {
        const from = Math.max(piece.from, START_HOUR * 60);
        const to = Math.min(piece.to, END_HOUR * 60);
        if (to <= from) continue;

        (byDay[piece.day] ||= []).push({
          person,
          index,
          from,
          to,
          full: piece,
        });
      }
    }
  });

  const label = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <section className="panel group-cal" style={{ marginBottom: 24 }}>
      <div className="section-heading">
        <div>
          <span className="eyebrow">EVERYONE’S CALENDARS</span>
          <h2>Who’s busy when</h2>
        </div>

        <div className="button-row">
          <button
            type="button"
            className="secondary"
            disabled={week === 0}
            onClick={() => setWeek(week - 1)}
            aria-label="Previous week"
          >
            ←
          </button>
          <span className="small">
            {days.length ? label.format(new Date(`${days[0]}T12:00:00Z`)) : ''}
            {' – '}
            {days.length ? label.format(new Date(`${days[6]}T12:00:00Z`)) : ''}
          </span>
          <button
            type="button"
            className="secondary"
            disabled={week >= weeks.length - 1}
            onClick={() => setWeek(week + 1)}
            aria-label="Next week"
          >
            →
          </button>
        </div>
      </div>

      <p>
        Colored blocks are when someone is busy. White space is free for
        everyone. Times are in {data.timeZone}.
      </p>

      <ul className="gc-legend">
        {people.map((person) => (
          <li key={person.name + person.isYou}>
            <span className="gc-swatch" style={{ background: person.color }} />
            {person.name}
            {person.isYou ? ' (you)' : ''}
            {!person.synced && <small> · hasn’t synced a calendar</small>}
          </li>
        ))}
      </ul>

      <div className="gc-scroll">
        <div className="gc-grid">
          <div className="gc-gutter">
            <div className="gc-head" />
            {hours.map((h) => (
              <div key={h} className="gc-hour" style={{ height: ROW }}>
                {clock(h * 60)}
              </div>
            ))}
          </div>

          {days.map((day) => {
            const inMonth = day.startsWith(data.month);
            const dayNumber = Number(day.slice(8));

            return (
              <div key={day} className={`gc-day ${inMonth ? '' : 'outside'}`}>
                <div className="gc-head">
                  {WEEKDAYS[new Date(`${day}T12:00:00Z`).getUTCDay()]}{' '}
                  <strong>{dayNumber}</strong>
                </div>

                <div
                  className="gc-body"
                  style={{ height: ROW * hours.length }}
                >
                  {(byDay[day] || []).map((b, i) => {
                    const text = `${b.person.name}’s Busy`;
                    return (
                      <div
                        key={i}
                        className="gc-block"
                        title={`${text} · ${clock(b.full.from)} – ${clock(b.full.to)}`}
                        style={{
                          top: ((b.from - START_HOUR * 60) / 60) * ROW,
                          height: Math.max(((b.to - b.from) / 60) * ROW, 14),
                          left: `${b.index * lane}%`,
                          width: `${lane}%`,
                          background: `${b.person.color}40`,
                          borderLeft: `3px solid ${b.person.color}`,
                        }}
                      >
                        <span>{text}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <p className="small">{monthLabel(data.month)}</p>
    </section>
  );
}

import { useState } from 'react';
import { api } from '../services/api.js';

export function describeRange(range, timeZone) {
  const start = new Date(range.start);
  const end = new Date(range.end);

  const date = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone,
  }).format(start);

  const clock = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone,
  });

  return { date, time: `${clock.format(start)} – ${clock.format(end)}` };
}

// Shows the locked-in time. The organizer can unlock it to pick another.
export default function FinalTime({ token, event, isOrganizer, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const chosen = event.finalTime;

  if (!chosen) {
    return (
      <section className="panel final-time pending">
        <span className="eyebrow">FINAL TIME</span>
        <p>
          {isOrganizer
            ? 'No final time chosen yet. Click “Pick this time” on one of the suggested times below.'
            : 'The organizer hasn’t picked a final time yet.'}
        </p>
      </section>
    );
  }

  const label = describeRange(chosen, event.timeZone);

  async function unlock() {
    setBusy(true);
    setError('');

    try {
      await api.clearFinalTime(token);
      onChanged();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="panel final-time" aria-label="Final time">
      <span className="eyebrow">✓ FINAL TIME</span>
      <h2>{label.date}</h2>
      <p className="best-time-clock">
        <time dateTime={chosen.start}>{label.time}</time>
        {' '}({event.timeZone})
      </p>

      {error && <p className="error" role="alert">{error}</p>}

      {isOrganizer && (
        <>
          <button
            type="button"
            className="secondary"
            onClick={unlock}
            disabled={busy}
          >
            {busy ? 'Unlocking…' : 'Change time'}
          </button>
          <p className="small">
            Changing the time unlocks it so you can pick another one from
            the suggestions below.
          </p>
        </>
      )}
    </section>
  );
}

import { useEffect, useState } from 'react';

import {
  startCalendarConnect,
  takeCalendarResult,
} from '../lib/calendarConnect.js';
import { api } from '../services/api.js';

// Remembers "sync as soon as I'm back from Google" across the redirect.
const PENDING_KEY = 'gather.syncAfterConnect';

function remember(token) {
  try { sessionStorage.setItem(PENDING_KEY, token); } catch { /* optional */ }
}

function takePending(token) {
  try {
    const match = sessionStorage.getItem(PENDING_KEY) === token;
    sessionStorage.removeItem(PENDING_KEY);
    return match;
  } catch {
    return false;
  }
}

// Lets someone in the event share when they're busy, straight from Google
// Calendar. Only busy times are shared, never what the events are.
export default function CalendarSync({ token, onSynced }) {
  const [name, setName] = useState('');
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');

  async function runSync() {
    setBusy(true);
    setError('');
    setDone('');

    try {
      const result = await api.syncBusy(token);
      setDone(
        `Synced. ${result.busy.length} busy ` +
        `${result.busy.length === 1 ? 'block' : 'blocks'} shared.`
      );
      if (onSynced) onSynced();
    } catch (err) {
      setError(err.message);
      if (/Reconnect|Connect your Google/.test(err.message)) {
        setConnected(false);
      }
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let ignore = false;
    const result = takeCalendarResult();

    Promise.all([api.getAvailability(token), api.calendarStatus()])
      .then(([me, status]) => {
        if (ignore) return;
        setName(me.name || '');
        setJoined(Boolean(me.name));
        setConnected(status.connected);
        setReady(true);

        const wasWaiting = takePending(token);

        if (result && !result.ok) {
          setError(result.message);
        } else if (wasWaiting && status.connected && me.name) {
          // Just came back from Google: finish the sync automatically.
          runSync();
        }
      })
      .catch((err) => {
        if (!ignore) setError(err.message);
      });

    return () => {
      ignore = true;
    };
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  async function onClick() {
    setBusy(true);
    setError('');
    setDone('');

    try {
      // Join first: the page leaves for Google and comes back after this.
      if (!joined) {
        await api.joinEvent(token, name.trim());
        setJoined(true);
      }

      if (!connected) {
        remember(token);
        startCalendarConnect(window.location.hash || '#home');
        return;
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
      return;
    }

    await runSync();
  }

  return (
    <section className="panel form" style={{ marginBottom: 24 }}>
      <div>
        <span className="eyebrow">USE YOUR GOOGLE CALENDAR</span>
        <h2>Share when you’re busy</h2>
        <p>
          Everyone in this event sees a block that says “{name || 'Your name'}’s
          Busy”. They never see what the event is, only the time.
        </p>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {done && <p className="success" role="status">{done}</p>}

      {!joined && (
        <label>
          Your display name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            disabled={busy}
          />
        </label>
      )}

      <button
        type="button"
        onClick={onClick}
        disabled={busy || !ready || (!joined && !name.trim())}
      >
        {busy
          ? 'Working…'
          : !ready
            ? 'Loading…'
            : !connected
              ? joined ? 'Connect and sync my calendar' : 'Join and sync my calendar'
              : joined ? 'Sync my calendar again' : 'Join and sync my calendar'}
      </button>
    </section>
  );
}

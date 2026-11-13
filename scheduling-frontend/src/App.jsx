import { useEffect, useState } from 'react';
import { api, USE_MOCKS } from './services/api.js';
import { monthLabel, slotLabel } from './lib/dates.js';
import CreateEventForm from './components/CreateEventForm.jsx';
import MonthCalendar from './components/MonthCalendar.jsx';
import SuggestedSlots from './components/SuggestedSlots.jsx';

function routeFromHash() {
  const [page, rawToken] = window.location.hash.slice(1).split('/');
  let token = '';
  try { token = decodeURIComponent(rawToken || ''); } catch { /* Invalid link produces the error screen. */ }
  return { page: ['invite', 'dashboard'].includes(page) ? page : 'home', token };
}
function go(page, token) { window.location.hash = token ? `${page}/${encodeURIComponent(token)}` : page; }

export default function App() {
  const [route, setRoute] = useState(routeFromHash);
  const [events, setEvents] = useState([]);
  const [event, setEvent] = useState(null);
  const [attendees, setAttendees] = useState([]);
  const [summary, setSummary] = useState({ slots: [], joinedCount: 0, sharedCount: 0 });
  const [selected, setSelected] = useState(null);
  const [name, setName] = useState('You');
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(false);
  const [shared, setShared] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    function change() { setRoute(routeFromHash()); setMessage(''); }
    window.addEventListener('hashchange', change);
    return () => window.removeEventListener('hashchange', change);
  }, []);

  useEffect(() => {
    let ignore = false;
    setLoading(true); setError(''); setEvent(null); setSelected(null);
    setJoined(false); setConnected(false); setShared(false);
    async function load() {
      try {
        if (route.page === 'home') {
          const list = await api.listEvents();
          if (!ignore) setEvents(list);
        } else {
          const [details, slots, dashboard] = await Promise.all([
            api.getInvite(route.token), api.getSlots(route.token),
            route.page === 'dashboard' ? api.getDashboard(route.token) : Promise.resolve(null),
          ]);
          if (!ignore) { setEvent(details); setSummary(slots); setAttendees(dashboard?.attendees || []); }
        }
      } catch (err) { if (!ignore) setError(err.message); }
      finally { if (!ignore) setLoading(false); }
    }
    load();
    return () => { ignore = true; };
  }, [route.page, route.token, revision]);

  async function act(action) {
    setBusy(true); setError(''); setMessage('');
    try { await action(); }
    catch (err) { setError(err.message || 'Something went wrong. Try again.'); }
    finally { setBusy(false); }
  }
  async function refreshSlots() { setSummary(await api.getSlots(route.token)); }

  return <div className="app">
    <header className="topbar"><a className="brand" href="#home"><span className="brand-icon">g</span>gather<span className="brand-period">.</span></a>
      <div className="header-right"><span className="badge">{USE_MOCKS ? 'Demo · mock data' : 'Backend mode'}</span>
        {USE_MOCKS && <button className="text-button" disabled={busy} onClick={() => act(async () => {
          api.resetDemo(); go('home'); setRevision((n) => n + 1);
        })}>Reset demo</button>}</div>
    </header>
    <main>
      <div className="hero"><span className="eyebrow">LESS BACK-AND-FORTH. MORE HANGING OUT.</span>
        <h1>{route.page === 'home' ? 'Good plans start here.' : route.page === 'invite' ? 'You’re invited.' : 'Bring everyone together.'}</h1>
        <p>{route.page === 'home' ? 'One invite. Everyone’s availability. A time that works.' : 'A little planning, a lot more time together.'}</p>
      </div>
      {error && <div className="error" role="alert">{error} <button className="text-button" onClick={() => setRevision((n) => n + 1)}>Retry</button></div>}
      {message && <div className="success" role="status">{message}</div>}
      {loading ? <p role="status">Loading your plans…</p> : route.page === 'home' ? <div className="layout">
        <CreateEventForm busy={busy} onCreate={(fields) => act(async () => {
          const created = await api.createEvent(fields); go('dashboard', created.inviteToken);
        })} />
        <section className="panel"><span className="eyebrow">YOUR PLANS</span><h2>On the horizon</h2>
          <div className="event-list">{events.map((item) => <button key={item.eventId} className="event-card" onClick={() => go('dashboard', item.inviteToken)}>
            <span className="event-icon" aria-hidden="true">✦</span><span><strong>{item.name}</strong><small>{monthLabel(item.month)}</small></span><span aria-hidden="true">→</span>
          </button>)}</div>
          <p className="small">Open Game Night to explore a filled-in example, or create your own plan.</p>
        </section>
      </div> : event && <>
        <section className="panel event-banner">
          <div><span className="eyebrow">{monthLabel(event.month)}</span><h2>{event.name}</h2><p>{event.description || 'No description yet.'}</p><small>{event.timeZone}</small></div>
          {route.page === 'dashboard' && <div className="invite-tools"><label>Shareable invite link<input aria-label="Invite link" readOnly value={`${window.location.origin}/#invite/${encodeURIComponent(route.token)}`} /></label>
            <div className="button-row"><button className="secondary" disabled={busy} onClick={() => act(async () => {
              await navigator.clipboard.writeText(`${window.location.origin}/#invite/${encodeURIComponent(route.token)}`);
              setMessage('Invite link copied. In mock mode, data is only available in this browser.');
            })}>Copy link</button><a className="button" href={`#invite/${encodeURIComponent(route.token)}`}>Preview invite →</a></div>
          </div>}
        </section>
        {route.page === 'invite' && <section className="panel join-panel"><div><span className="eyebrow">LET’S FIND A TIME</span><h2>Share when you’re free.</h2><p>{USE_MOCKS ? 'Try the three steps below. Google connection and sharing are simulated.' : 'Join, connect your account, and share your availability.'}</p></div>
          <label>Your name<input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} /></label>
          <div className="button-row">
            <button disabled={busy || !name.trim()} onClick={() => act(async () => { await api.joinEvent(route.token, name.trim()); setJoined(true); await refreshSlots(); setMessage('You joined the event.'); })}>{joined ? '✓ Joined' : '1. Join event'}</button>
            <button className="secondary" disabled={busy || !joined} onClick={() => act(async () => { await api.connectCalendar(); setConnected(true); })}>{connected ? '✓ Demo connected' : `2. ${USE_MOCKS ? 'Simulate Google connection' : 'Connect Google'}`}</button>
            <button className="secondary" disabled={busy || !joined || (!USE_MOCKS ? false : !connected)} onClick={() => act(async () => { await api.shareAvailability(route.token); setShared(true); await refreshSlots(); setMessage('Availability shared.'); })}>{shared ? '✓ Shared · share again' : '3. Share availability'}</button>
          </div>
          {USE_MOCKS && <a className="text-link" href={`#dashboard/${encodeURIComponent(route.token)}`}>Back to organizer demo →</a>}
        </section>}
        <div className="layout"><MonthCalendar month={event.month} slots={summary.slots} timeZone={event.timeZone} selected={selected} onSelect={setSelected} />
          <SuggestedSlots summary={summary} timeZone={event.timeZone} selected={selected} onSelect={setSelected} /></div>
        {route.page === 'dashboard' && <section className="panel attendee-panel"><div className="section-heading"><div><span className="eyebrow">THE GROUP</span><h2>Who’s in?</h2></div><span className="badge">{summary.sharedCount}/{summary.joinedCount} shared</span></div>
          {!attendees.length && <p>No one has joined yet. Open the invite to try joining.</p>}
          {attendees.map((person) => <div className="attendee" key={person.attendeeId}><span className="avatar">{person.name.slice(0, 1)}</span><div><strong>{person.name}</strong>
            <small>{!person.sharedAt ? 'Availability unknown' : person.busy.length ? person.busy.map((block) => slotLabel(block, event.timeZone)).join('; ') : 'No conflicts reported for this month'}</small></div><span className={`status ${person.sharedAt ? 'ready' : ''}`}>{person.sharedAt ? 'Shared' : 'Waiting'}</span></div>)}
        </section>}
      </>}
      <footer>Gather · Frontend starter{USE_MOCKS && ' · Changes stay in this browser · Sample suggestions only'}</footer>
    </main>
  </div>;
}

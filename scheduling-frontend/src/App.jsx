import { useEffect, useRef, useState } from 'react';

import AccountPanel from './components/AccountPanel.jsx';
import CalendarPanel from './components/CalendarPanel.jsx';
import AvailabilityForm from './components/AvailabilityForm.jsx';
import LoginPage from './components/LoginPage.jsx';
import CreateEventForm from './components/CreateEventForm.jsx';
import OrganizerAvailability from './components/OrganizerAvailability.jsx';
import BestTimes from './components/BestTimes.jsx';

import { api } from './services/api.js';
import { monthLabel } from './lib/dates.js';

function readRoute() {
  const [page, rawToken] = window.location.hash.slice(1).split('/');

  let token = '';

  try {
    token = decodeURIComponent(rawToken || '');
  } catch {
    // The API will reject invalid invite tokens.
  }

  return {
    page: ['invite', 'dashboard', 'login'].includes(page) ? page : 'home',
    token,
  };
}

function go(page, token) {
  window.location.hash = token
    ? `${page}/${encodeURIComponent(token)}`
    : page;
}

function EventList({ events, joined }) {
  if (events.length === 0) {
    return (
      <p>
        {joined
          ? 'You haven’t joined any events yet. Open an invite link to join.'
          : 'You haven’t created any events yet.'}
      </p>
    );
  }

  return (
    <div className="event-list">
      {events.map((event) => (
        <button
          type="button"
          key={event.eventId}
          className="event-card"
          onClick={() => go(
            joined ? 'invite' : 'dashboard',
            event.inviteToken
          )}
        >
          <span className="event-icon" aria-hidden="true">
            {joined ? '↗' : '✦'}
          </span>

          <span>
            <strong>{event.name}</strong>
            <small>{monthLabel(event.month)}</small>
            <small>
              {joined
                ? 'View or edit your availability'
                : 'View your organizer dashboard'}
            </small>
          </span>

          <span aria-hidden="true">→</span>
        </button>
      ))}
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState(readRoute);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState('organizing');

  const [organizedEvents, setOrganizedEvents] = useState([]);
  const [joinedEvents, setJoinedEvents] = useState([]);

  const [event, setEvent] = useState(null);
  const [attendees, setAttendees] = useState([]);

  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const keepMessage = useRef(false);

  function refresh() {
    setRevision((value) => value + 1);
  }

  useEffect(() => {
    function onHashChange() {
      setRoute(readRoute());

      if (keepMessage.current) {
        keepMessage.current = false;
      } else {
        setMessage('');
      }
    }

    window.addEventListener('hashchange', onHashChange);

    return () => {
      window.removeEventListener('hashchange', onHashChange);
    };
  }, []);

  useEffect(() => {
    let ignore = false;

    setLoading(true);
    setError('');
    setOrganizedEvents([]);
    setJoinedEvents([]);
    setEvent(null);
    setAttendees([]);

    async function load() {
      try {
        if (route.page === 'login') {
          return;
        }

        if (route.page === 'home') {
          const [organized, joined] = await Promise.all([
            api.listEvents(),
            api.listJoinedEvents(),
          ]);

          if (!ignore) {
            setOrganizedEvents(organized);
            setJoinedEvents(joined);
          }
        } else {
          const [details, dashboard] = await Promise.all([
            api.getInvite(route.token),

            route.page === 'dashboard'
              ? api.getDashboard(route.token)
              : Promise.resolve(null),
          ]);

          if (!ignore) {
            setEvent(details);
            setAttendees(dashboard?.attendees || []);
          }
        }
      } catch (err) {
        if (!ignore) {
          setError(err.message);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      ignore = true;
    };
  }, [route.page, route.token, revision]);

  async function createEvent(fields) {
    setBusy(true);
    setError('');
    setMessage('');

    try {
      const created = await api.createEvent(fields);
      go('dashboard', created.inviteToken);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deleteEvent() {
    const confirmed = window.confirm(
      `Delete “${event.name}”? This also removes everyone’s ` +
      'availability and the invite link will stop working. ' +
      'This can’t be undone.'
    );

    if (!confirmed) return;

    setBusy(true);
    setError('');

    try {
      await api.deleteEvent(event.eventId);
      keepMessage.current = true;
      setMessage('Event deleted.');
      go('home');
    } catch (err) {
      keepMessage.current = false;
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const inviteLink =
    `${window.location.origin}/#invite/` +
    encodeURIComponent(route.token);

  async function copyInvite() {
    setError('');

    try {
      await navigator.clipboard.writeText(inviteLink);
      setMessage('Invite link copied.');
    } catch {
      setError(
        'Could not copy automatically. Copy the link from the box.'
      );
    }
  }

  const isJoinedTab = activeTab === 'joined';

  return (
    <div className="app">
      <header className="topbar">
        <a className="brand" href="#home">
          <span className="brand-icon">g</span>
          gather
          <span className="brand-period">.</span>
        </a>

        <div className="header-right">
          {/* "Refresh plans" button hidden for now; refresh() is still
              used by the Retry button. Re-add it here if needed:
              <button type="button" className="text-button"
                onClick={refresh} disabled={loading || busy}>
                Refresh plans
              </button> */}

          <a className="text-link" href="#home">
            My events
          </a>
        </div>
      </header>

      <main>
        {route.page === 'login' ? (
          <LoginPage onSignedIn={() => go('home')} />
        ) : (
          <>
        <AccountPanel onUserChange={setUser} />

        {user && route.page === 'home' && (
          <CalendarPanel key={user.userId} />
        )}

        <div className="hero">
          <span className="eyebrow">
            LESS BACK-AND-FORTH. MORE HANGING OUT.
          </span>

          <h1>
            {route.page === 'home'
              ? 'Your plans, all together.'
              : route.page === 'invite'
                ? 'Make time for a good time.'
                : 'Find your time together.'}
          </h1>

          <p>
            {route.page === 'home'
              ? 'Manage the events you organize and the ones you’ve joined.'
              : route.page === 'invite'
                ? 'Join this event and share when you’re available.'
                : 'See who has responded and browse their available times.'}
          </p>
        </div>

        {error && (
          <div className="error" role="alert">
            {error}{' '}
            <button
              type="button"
              className="text-button"
              onClick={refresh}
            >
              Retry
            </button>
          </div>
        )}

        {message && (
          <div className="success" role="status">
            {message}
          </div>
        )}

        {loading ? (
          <p role="status">Loading your plans…</p>
        ) : route.page === 'home' ? (
          <>
            <div
              className="button-row"
              style={{ marginBottom: 24 }}
              aria-label="Event categories"
            >
              <button
                type="button"
                className={isJoinedTab ? 'secondary' : ''}
                aria-pressed={!isJoinedTab}
                onClick={() => setActiveTab('organizing')}
              >
                Organizing ({organizedEvents.length})
              </button>

              <button
                type="button"
                className={isJoinedTab ? '' : 'secondary'}
                aria-pressed={isJoinedTab}
                onClick={() => setActiveTab('joined')}
              >
                Joined ({joinedEvents.length})
              </button>
            </div>

            <div className={isJoinedTab ? '' : 'layout'}>
              {!isJoinedTab && (
                <CreateEventForm
                  busy={busy}
                  onCreate={createEvent}
                />
              )}

              <section className="panel">
                <span className="eyebrow">
                  {isJoinedTab ? 'YOU’RE INVITED' : 'YOU’RE THE ORGANIZER'}
                </span>

                <h2>
                  {isJoinedTab
                    ? 'Events you’ve joined'
                    : 'Events you organize'}
                </h2>

                <p>
                  {isJoinedTab
                    ? 'Open an event to view or edit your availability.'
                    : 'Open an event to see your group’s availability.'}
                </p>

                {!error && (
                  <EventList
                    events={
                      isJoinedTab ? joinedEvents : organizedEvents
                    }
                    joined={isJoinedTab}
                  />
                )}
              </section>
            </div>
          </>
        ) : event ? (
          <>
            <section className="panel event-banner">
              <div>
                <span className="eyebrow">
                  {monthLabel(event.month)}
                </span>

                <h2>{event.name}</h2>
                <p>{event.description || 'No description yet.'}</p>
                <small>Time zone: {event.timeZone}</small>
              </div>

              {route.page === 'dashboard' && (
                <div className="invite-tools">
                  <label>
                    Shareable invite link
                    <input readOnly value={inviteLink} />
                  </label>

                  <div className="button-row">
                    <button
                      type="button"
                      className="secondary"
                      onClick={copyInvite}
                    >
                      Copy link
                    </button>

                    <a
                      className="button"
                      href={`#invite/${encodeURIComponent(route.token)}`}
                    >
                      Preview invite →
                    </a>
                  </div>

                  <button
                    type="button"
                    className="danger"
                    onClick={deleteEvent}
                    disabled={busy}
                  >
                    {busy ? 'Deleting…' : 'Delete event'}
                  </button>
                </div>
              )}
            </section>

            {route.page === 'invite' && (
              <AvailabilityForm
                key={`${route.token}-${revision}`}
                token={route.token}
                event={event}
                onSaved={() => {
                  setMessage(
                    'You joined and your availability was saved.'
                  );
                  refresh();
                }}
              />
            )}

            {route.page === 'dashboard' && (
              <>
                <BestTimes token={route.token} refreshKey={revision} />
                <OrganizerAvailability
                  attendees={attendees}
                  timeZone={event.timeZone}
                />
              </>
            )}
          </>
        ) : null}
          </>
        )}

        <footer>Gather · Scheduling prototype</footer>
      </main>
    </div>
  );
}
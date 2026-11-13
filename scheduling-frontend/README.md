# Gather — scheduling frontend starter

A small React + Vite frontend you can edit now and connect to a backend later.
Plain JavaScript and CSS; no UI framework or router library to learn first.

## Run it

Use Node.js 20.19+ or 22.12+ (Node 24 also works).

```bash
cd scheduling-frontend
npm install
npm run dev
```

Open the localhost URL printed in the terminal. To check a production build:

```bash
npm run build
npm run preview
```

If your team already has a React/Vite app, copy the `src/` files and merge dependencies instead of replacing your package.json. This starter's `src/main.jsx` imports its CSS. Hash navigation avoids needing server routing rules.

## What to try

1. Open Game Night. Click a suggested time or the highlighted calendar day.
2. Copy the invite link or click Preview invite.
3. Join, simulate Google connection, and share availability.
4. Go back to the organizer demo to see the updated sharing status.
5. Create a new event. It starts with no attendees or suggestions.

Mock events and attendee updates persist in localStorage. Reset demo restores the sample.
The copied invite works in the same browser on the same origin. Another device/browser will NOT see custom mock events; that requires the shared backend.

## Where to edit

| File | Responsibility |
| --- | --- |
| `src/App.jsx` | Page navigation, loading, errors, event/invite/dashboard layout |
| `src/components/CreateEventForm.jsx` | Event form fields |
| `src/components/MonthCalendar.jsx` | Month grid and day selection |
| `src/components/SuggestedSlots.jsx` | Suggested time buttons and preview |
| `src/styles.css` | Colors, spacing, fonts, responsive layout |
| `src/data/mockData.js` | Sample event, people, and suggested times |
| `src/services/api.js` | ALL data access; teammate connects the backend here |
| `src/lib/dates.js` | Time-zone-aware date labels |

## Handoff to your groupmate

The frontend imports `api` rather than calling Google or the database from components.
Keep the returned shapes below, and the screens can keep working while the data source changes.

1. Copy `.env.example` to `.env`.
2. Set `VITE_USE_MOCKS=false` and set `VITE_API_BASE_URL` to your backend URL.
3. Implement/update the routes in `src/services/api.js`.
4. Restart Vite. Variables are read when the dev server starts.

### Proposed API contract

These are this starter's proposed routes, not existing implemented endpoints.
The list and dashboard routes extend the previous work spec.

| Method / path | Result expected by the UI |
| --- | --- |
| `GET /api/events` | `Event[]` (events the signed-in organizer can access) |
| `POST /api/events` | Created `Event`; request is `{name, description, month, timeZone}` |
| `GET /api/invites/:token` | `Event` |
| `GET /api/invites/:token/dashboard` | `{attendees: Attendee[]}`; organizer authorization required |
| `GET /api/invites/:token/slots` | `{slots: Slot[], sharedCount, joinedCount}` |
| `PUT /api/invites/:token/join` | Attendee; request is `{name}`; backend derives identity from session |
| `GET /api/auth/google/start` | Backend begins OAuth and redirects back to the invite after completion |
| `PUT /api/invites/:token/availability` | `{sharedAt, busy: Slot[]}`; server fetches calendar or Sheets data |

```js
// Event
{
  eventId: 'e1', name: 'Game Night', description: 'Bring a game.',
  month: '2026-12', timeZone: 'America/Los_Angeles',
  inviteToken: 'demo-game-night', inviteUrl: 'http://localhost:5173/#invite/demo-game-night'
}

// Attendee (organizer-only data)
{
  attendeeId: 'u1', name: 'Alex', sharedAt: '2026-12-01T19:00:00Z',
  busy: [{ start: '2026-12-05T22:00:00Z', end: '2026-12-06T01:00:00Z' }]
}

// Slots response
{
  slots: [{ start: '2026-12-06T01:00:00Z', end: '2026-12-06T02:00:00Z' }],
  sharedCount: 2, joinedCount: 3
}
```

Store timestamps as UTC ISO strings, months as YYYY-MM, and time zones as IANA names.
`sharedAt: null` means unknown availability. A shared snapshot with `busy: []` means no reported conflicts.

### Google Sheets or Google Calendar?

Either can sit behind the API adapter. If your groupmate is using Sheets, the backend can read rows and convert them to these objects. The Google connection button currently models Calendar OAuth; rename/remove it or update `connectCalendar()` for a Sheets-backed workflow. Frontend components do not need Google SDKs.

Keep service-account keys, Google client secrets, and refresh tokens on the backend. `VITE_` variables are public frontend configuration. For a separate frontend/backend origin, configure CORS and cookie settings on the backend. Implement the backend's CSRF token/header requirements in `request()` before enabling session-authenticated writes.

## Deliberate skeleton boundaries

- Google connection is simulated in mock mode. There is no real OAuth or Google access.
- Only Game Night has fixed example suggestions. There is no overlap calculation yet; your backend should calculate real suggestions.
- Preview selects a suggested time and highlights its day. This is not a personal calendar overlay/editor.
- All mock actions use one pretend person (`demo-you`). This is not a multi-user authentication system.
- In backend mode, returning from OAuth reloads the page. Rejoining is idempotent; sharing is available after joining and the server verifies Google authorization. Replace the local connection flags with a server session/account-status endpoint if you want persistent connection indicators.
- Hash routes are UI navigation, not access control. The backend must restrict the dashboard to the organizer.
- Google Calendar event creation/editing is a later extension.

## Good first edits

Change the event form and dashboard layout first. Add any extra fields to the form AND agree on their names with your groupmate. Keep network code in `services/api.js` so you can build the frontend independently.

Setup reference: https://vite.dev/guide/

// Connecting a calendar sends the whole page to Google and back, so it
// works the same in every browser (no popups to block).

export function startCalendarConnect(returnTo = '#home') {
  window.location.assign(
    `/api/calendar/start?returnTo=${encodeURIComponent(returnTo)}`
  );
}

const MESSAGES = {
  connected: [true, 'Google Calendar connected.'],
  denied: [false, 'Calendar access was not allowed. Click Continue on Google’s screen to allow it.'],
  no_scope: [false, 'Calendar access was not granted. On Google’s screen, allow Gather to see your calendar.'],
  wrong_account: [false, 'That is a different Google account from the one you signed in with.'],
  rejected: [false, 'Google rejected the connection. Please try again.'],
  expired: [false, 'That took too long. Please try again.'],
  login: [false, 'Please sign in first.'],
  not_configured: [false, 'Calendar is not set up on the server.'],
};

// After Google sends us back, the address looks like /?calendar=connected#home.
// Read that once, show it to the user, and tidy the address.
export function takeCalendarResult() {
  const key = new URLSearchParams(window.location.search).get('calendar');
  if (!key) return null;

  window.history.replaceState(null, '', window.location.pathname + window.location.hash);

  const [ok, message] = MESSAGES[key] || [false, 'Calendar connection failed.'];
  return { ok, message };
}

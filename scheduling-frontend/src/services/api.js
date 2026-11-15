export const USE_MOCKS = false;

async function request(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();

  const headers = {
    ...options.headers,
  };

  if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const csrfResponse = await fetch('/api/csrf', {
      credentials: 'same-origin',
    });

    if (!csrfResponse.ok) {
      throw new Error('Could not get a security token.');
    }

    const { csrfToken } = await csrfResponse.json();

    headers['X-CSRFToken'] = csrfToken;
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(path, {
    ...options,
    method,
    headers,
    credentials: 'same-origin',
  });

  const data = await response.json().catch(() => {
    throw new Error(
      'Unexpected server response. Check the Django terminal.'
    );
  });

  if (!response.ok) {
    throw new Error(
      data.error || `Request failed (${response.status}).`
    );
  }

  return data;
}

function invitePath(token) {
  return `/api/invites/${encodeURIComponent(token)}`;
}

export const api = {
  listEvents() {
    return request('/api/events');
  },

  listJoinedEvents() {
    return request('/api/events/joined');
  },

  createEvent(fields) {
    return request('/api/events', {
      method: 'POST',
      body: JSON.stringify(fields),
    });
  },

  getInvite(token) {
    return request(invitePath(token));
  },

  getDashboard(token) {
    return request(`${invitePath(token)}/dashboard`);
  },

  getSlots(token) {
    return request(`${invitePath(token)}/slots`);
  },

  joinEvent(token, name) {
    return request(`${invitePath(token)}/join`, {
      method: 'PUT',
      body: JSON.stringify({ name }),
    });
  },

  getAvailability(token) {
    return request(`${invitePath(token)}/availability`);
  },

  saveAvailability(token, available) {
    return request(`${invitePath(token)}/availability`, {
      method: 'PUT',
      body: JSON.stringify({ available }),
    });
  },

  async connectCalendar() {
    throw new Error(
      'Google connection is not enabled. Use manual availability.'
    );
  },

  async shareAvailability() {
    throw new Error(
      'Use the manual availability form to share your times.'
    );
  },
};
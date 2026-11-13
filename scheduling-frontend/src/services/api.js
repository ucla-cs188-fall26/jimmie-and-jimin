import { demoEvent, demoAttendees, demoSlots } from '../data/mockData.js';

// TEAMMATE HANDOFF: Components only call this object. Replace the HTTP routes
// here or transform Google Sheets/Calendar responses here; keep UI shapes stable.
export const USE_MOCKS = import.meta.env.VITE_USE_MOCKS !== 'false';
const BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000').replace(/\/$/, '');
const STORAGE_KEY = 'gather-demo-v1';

function initialData() {
  return { events: [demoEvent], attendees: { [demoEvent.eventId]: demoAttendees } };
}
function readData() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(initialData());
  try { return JSON.parse(saved); }
  catch { throw new Error('Demo data could not be read. Use Reset demo to start again.'); }
}
function saveData(data) { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
function findEvent(data, token) {
  const event = data.events.find((item) => item.inviteToken === token);
  if (!event) throw new Error('Invite not found. Check your link or open the sample event.');
  return event;
}
function inviteUrl(token) { return `${window.location.origin}/#invite/${encodeURIComponent(token)}`; }
function withLink(event) { return { ...event, inviteUrl: inviteUrl(event.inviteToken) }; }

async function request(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include', ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) throw new Error(`Request failed (${response.status}). Please try again.`);
  return response.status === 204 ? null : response.json();
}

export const api = {
  async listEvents() {
    if (!USE_MOCKS) return request('/api/events'); // Expected: Event[]
    return readData().events.map(withLink);
  },
  async createEvent(fields) {
    if (!USE_MOCKS) return request('/api/events', { method: 'POST', body: JSON.stringify(fields) });
    const data = readData();
    const event = { ...fields, eventId: crypto.randomUUID(), inviteToken: crypto.randomUUID() };
    data.events.push(event);
    data.attendees[event.eventId] = [];
    saveData(data);
    return withLink(event);
  },
  async getInvite(token) {
    if (!USE_MOCKS) return request(`/api/invites/${encodeURIComponent(token)}`);
    return withLink(findEvent(readData(), token));
  },
  async getDashboard(token) {
    // Organizer-only endpoint in a real backend. Never expose private busy blocks to invite viewers.
    if (!USE_MOCKS) return request(`/api/invites/${encodeURIComponent(token)}/dashboard`);
    const data = readData();
    const event = findEvent(data, token);
    return { attendees: data.attendees[event.eventId] || [] };
  },
  async getSlots(token) {
    if (!USE_MOCKS) return request(`/api/invites/${encodeURIComponent(token)}/slots`);
    const data = readData();
    const event = findEvent(data, token);
    const attendees = data.attendees[event.eventId] || [];
    return {
      slots: event.eventId === 'e1' ? demoSlots : [],
      joinedCount: attendees.length, sharedCount: attendees.filter((a) => a.sharedAt).length,
    };
  },
  async joinEvent(token, name) {
    if (!USE_MOCKS) return request(`/api/invites/${encodeURIComponent(token)}/join`, {
      method: 'PUT', body: JSON.stringify({ name }),
    });
    const data = readData();
    const event = findEvent(data, token);
    const attendees = data.attendees[event.eventId];
    let attendee = attendees.find((a) => a.attendeeId === 'demo-you');
    if (attendee) attendee.name = name;
    else {
      attendee = { attendeeId: 'demo-you', name, sharedAt: null, busy: [] };
      attendees.push(attendee);
    }
    saveData(data);
    return attendee;
  },
  async connectCalendar() {
    if (!USE_MOCKS) {
      // Proposed route: backend owns OAuth, credentials, and redirect validation.
      window.location.assign(`${BASE_URL}/api/auth/google/start`);
      return;
    }
    return { connected: true }; // Simulated only; no Google account is accessed.
  },
  async shareAvailability(token) {
    if (!USE_MOCKS) return request(`/api/invites/${encodeURIComponent(token)}/availability`, { method: 'PUT' });
    const data = readData();
    const event = findEvent(data, token);
    const attendee = data.attendees[event.eventId].find((a) => a.attendeeId === 'demo-you');
    if (!attendee) throw new Error('Join the event before sharing availability.');
    attendee.sharedAt = new Date().toISOString();
    attendee.busy = []; // Demo person has no conflicts. Never interpret a missing snapshot as free.
    saveData(data);
    return { sharedAt: attendee.sharedAt, busy: attendee.busy };
  },
  resetDemo() { localStorage.removeItem(STORAGE_KEY); },
};

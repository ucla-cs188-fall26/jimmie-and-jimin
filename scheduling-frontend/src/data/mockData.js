// Replace these example people/blocks freely. All timestamps are UTC.
export const demoEvent = {
  eventId: 'e1', name: 'Game Night', description: 'Bring your favorite game. We’ll find a time together.',
  month: '2026-12', timeZone: 'America/Los_Angeles', inviteToken: 'demo-game-night',
};

export const demoAttendees = [
  { attendeeId: 'u1', name: 'Alex', sharedAt: '2026-12-01T19:00:00Z', busy: [{ start: '2026-12-05T22:00:00Z', end: '2026-12-06T01:00:00Z' }] },
  { attendeeId: 'u2', name: 'Sam', sharedAt: '2026-12-01T20:00:00Z', busy: [] },
  { attendeeId: 'demo-you', name: 'You', sharedAt: null, busy: [] },
];

// A fixed demo fixture, NOT a scheduling algorithm. Only the seeded event has suggestions.
export const demoSlots = [
  { start: '2026-12-06T01:00:00Z', end: '2026-12-06T02:00:00Z' },
  { start: '2026-12-06T02:00:00Z', end: '2026-12-06T03:00:00Z' },
];

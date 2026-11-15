function formatDate(day) {
  // Submitted dates are local calendar dates, not UTC timestamps.
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${day}T12:00:00Z`));
}

function formatTime(value) {
  const [hour, minute] = value.split(':').map(Number);
  const period = hour >= 12 ? 'PM' : 'AM';
  const displayHour = hour % 12 || 12;
  const displayMinute = minute === 0
    ? ''
    : `:${String(minute).padStart(2, '0')}`;

  return `${displayHour}${displayMinute} ${period}`;
}

function groupByDate(available) {
  const groups = new Map();

  for (const block of available) {
    if (!groups.has(block.date)) {
      groups.set(block.date, []);
    }

    groups.get(block.date).push(block);
  }

  return [...groups.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, blocks]) => ({
      date,
      blocks: blocks.sort(
        (a, b) =>
          a.start.localeCompare(b.start) ||
          a.end.localeCompare(b.end)
      ),
    }));
}

function hasSubmitted(person) {
  return Boolean(person.sharedAt) && Array.isArray(person.available);
}

export default function OrganizerAvailability({ attendees, timeZone }) {
  const people = [...attendees].sort(
    (a, b) => a.name.localeCompare(b.name)
  );

  const sharedCount = people.filter(hasSubmitted).length;
  const waitingCount = people.length - sharedCount;

  return (
    <section className="organizer-availability">
      <div className="availability-heading">
        <div>
          <span className="eyebrow">YOUR GROUP</span>
          <h2>Who’s free, and when?</h2>
          <p>
            Everyone’s submitted times, grouped by person and date.
          </p>
        </div>

        <span className="availability-timezone">
          All times: {timeZone}
        </span>
      </div>

      <div className="availability-stats">
        <div className="availability-stat">
          <strong>{people.length}</strong>
          <span>Joined</span>
        </div>

        <div className="availability-stat">
          <strong>{sharedCount}</strong>
          <span>Shared availability</span>
        </div>

        <div className="availability-stat">
          <strong>{waitingCount}</strong>
          <span>Still waiting</span>
        </div>
      </div>

      {people.length === 0 ? (
        <div className="panel availability-empty">
          <h3>Your group starts here.</h3>
          <p>
            Share the invite link. People will appear here after joining.
          </p>
        </div>
      ) : (
        <div className="availability-people">
          {people.map((person) => {
            const submitted = hasSubmitted(person);
            const days = groupByDate(person.available || []);
            const hasTimes = days.length > 0;

            return (
              <article
                className="panel person-availability"
                key={person.attendeeId}
              >
                <div className="person-heading">
                  <span className="person-avatar" aria-hidden="true">
                    {person.name.slice(0, 1).toUpperCase()}
                  </span>

                  <div className="person-title">
                    <h3>{person.name}</h3>
                    <p>
                      {submitted
                        ? hasTimes
                          ? `${days.length} ${
                              days.length === 1 ? 'day' : 'days'
                            } available`
                          : 'No dates available'
                        : 'Availability is unknown'}
                    </p>
                  </div>

                  <span
                    className={
                      submitted
                        ? 'availability-status submitted'
                        : 'availability-status waiting'
                    }
                  >
                    {submitted ? 'Shared' : 'Waiting'}
                  </span>
                </div>

                {!submitted ? (
                  <div className="availability-note">
                    Hasn’t shared availability yet.
                  </div>
                ) : !hasTimes ? (
                  <div className="availability-note">
                    Submitted availability, but has no available times
                    for this month.
                  </div>
                ) : (
                  <div className="availability-days">
                    {days.map(({ date, blocks }) => (
                      <div className="availability-day" key={date}>
                        <time className="availability-date" dateTime={date}>
                          {formatDate(date)}
                        </time>

                        <div className="availability-times">
                          {blocks.map((block, index) => (
                            <span
                              className="availability-time"
                              key={`${block.start}-${block.end}-${index}`}
                            >
                              {formatTime(block.start)}
                              {' – '}
                              {formatTime(block.end)}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
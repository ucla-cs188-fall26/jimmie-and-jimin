import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

function displaySlot(slot, timeZone) {
  const date = new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', year: 'numeric', timeZone,
  }).format(new Date(slot.start));
  const clock = new Intl.DateTimeFormat('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone,
  });
  return { date, time: `${clock.format(new Date(slot.start))} – ${clock.format(new Date(slot.end))}` };
}

export default function BestTimes({ token, refreshKey, finalTime, onPicked }) {
  const [picking, setPicking] = useState('');
  const [pickError, setPickError] = useState('');
  const [data, setData] = useState(null);

  async function pick(slot) {
    setPicking(slot.start);
    setPickError('');

    try {
      await api.setFinalTime(token, slot.start, slot.end);
      onPicked();
    } catch (err) {
      setPickError(err.message);
    } finally {
      setPicking('');
    }
  }
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    setError('');
    setData(null);
    api.getSuggestions(token)
      .then((result) => { if (!ignore) setData(result); })
      .catch((err) => { if (!ignore) setError(err.message); })
      .finally(() => { if (!ignore) setLoading(false); });
    return () => { ignore = true; };
  }, [token, refreshKey, retry]);

  return (
    <section className="panel best-times" aria-labelledby="best-times-title">
      <span className="eyebrow">LESS GUESSWORK</span>
      <h2 id="best-times-title">Suggested times</h2>
      <p>One-hour options ranked by how many people can attend.</p>
      {pickError && <p className="error" role="alert">{pickError}</p>}
      {loading ? <p role="status">Finding your group’s best times…</p> : error ? (
        <div className="error" role="alert">
          {error}{' '}
          <button type="button" className="text-button" onClick={() => setRetry((n) => n + 1)}>Retry</button>
        </div>
      ) : data && (
        <>
          <p className="best-times-summary">
            <strong>{data.sharedCount} of {data.joinedCount}</strong> joined participants shared availability.
            {' '}All times: {data.timeZone}.
          </p>
          {data.slots.length ? (
            <ol className="best-times-list">
              {data.slots.map((slot, index) => {
                const label = displaySlot(slot, data.timeZone);
                return (
                  <li key={slot.start} className="best-time-card">
                    <div className="best-time-heading">
                      <span className="badge">{index === 0 ? 'Top match' : `Option ${index + 1}`}</span>
                      <strong>{slot.availableCount} of {data.joinedCount} can attend</strong>
                    </div>
                    <h3>{label.date}</h3>
                    <p className="best-time-clock"><time dateTime={slot.start}>{label.time}</time></p>
                    <p><strong>Available:</strong> {slot.availableNames.join(', ')}</p>
                    {slot.unavailableNames.length > 0 && <p><strong>Unavailable:</strong> {slot.unavailableNames.join(', ')}</p>}
                    {finalTime && new Date(finalTime.start).getTime() === new Date(slot.start).getTime() ? (
                      <span className="badge">✓ Chosen</span>
                    ) : (
                      <button
                        type="button"
                        className={finalTime ? 'secondary' : ''}
                        onClick={() => pick(slot)}
                        disabled={Boolean(picking)}
                      >
                        {picking === slot.start
                          ? 'Saving…'
                          : finalTime ? 'Switch to this time' : 'Pick this time'}
                      </button>
                    )}
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="notice">
              {data.sharedCount === 0
                ? 'Share the invite and ask participants to submit availability to see suggestions.'
                : 'No upcoming one-hour options match what people shared. Times that have already passed are skipped, so add availability on a future date.'}
            </div>
          )}
          {data.unknownNames.length > 0 && (
            <p className="notice"><strong>Still waiting:</strong> {data.unknownNames.join(', ')}. Their availability is unknown.</p>
          )}
          <p className="small best-times-rules">
            Searches noon–8 PM in the event’s time zone, starting every 30 minutes.
            Ties favor earlier times. Options may overlap. The organizer counts only after joining and submitting.
            Use Refresh plans to load updates. Suggestions do not finalize a booking.
          </p>
        </>
      )}
    </section>
  );
}

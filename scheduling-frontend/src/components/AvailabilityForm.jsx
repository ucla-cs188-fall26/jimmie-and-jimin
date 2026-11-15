import { useEffect, useState } from 'react';
import { api } from '../services/api.js';

export default function AvailabilityForm({ token, event, onSaved }) {
  const [name, setName] = useState('');
  const [available, setAvailable] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const firstDay = `${event.month}-01`;
  const [year, month] = event.month.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lastDay = `${event.month}-${daysInMonth}`;

  useEffect(() => {
    let ignore = false;

    api.getAvailability(token)
      .then((data) => {
        if (!ignore) {
          setName(data.name);
          setAvailable(data.available);
        }
      })
      .catch((err) => {
        if (!ignore) setError(err.message);
      })
      .finally(() => {
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [token]);

  function addRange() {
    setAvailable([
      ...available,
      { date: firstDay, start: '12:00', end: '13:00' },
    ]);
  }

  function updateRange(index, field, value) {
    setAvailable(available.map((block, i) => (
      i === index ? { ...block, [field]: value } : block
    )));
  }

  function removeRange(index) {
    setAvailable(available.filter((_, i) => i !== index));
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');

    try {
      await api.joinEvent(token, name.trim());
      await api.saveAvailability(token, available);
      onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return <p role="status">Loading availability…</p>;
  }

  return (
    <form className="panel form" onSubmit={submit}
      style={{ marginBottom: 24 }}>
      <div>
        <h2>When are you available?</h2>
        <p>
          Add dates and time ranges for {event.month}.
          All times are in {event.timeZone}.
        </p>
      </div>

      {error && <p className="error" role="alert">{error}</p>}

      <label>
        Your display name
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          maxLength={60}
          disabled={busy}
        />
      </label>

      {available.map((block, index) => (
        <fieldset key={index} disabled={busy}>
          <legend>Available time {index + 1}</legend>

          <label>
            Date
            <input
              type="date"
              value={block.date}
              min={firstDay}
              max={lastDay}
              onChange={(e) => updateRange(index, 'date', e.target.value)}
              required
            />
          </label>

          <div className="two-columns">
            <label>
              From
              <input
                type="time"
                value={block.start}
                onChange={(e) => updateRange(index, 'start', e.target.value)}
                required
              />
            </label>

            <label>
              Until
              <input
                type="time"
                value={block.end}
                onChange={(e) => updateRange(index, 'end', e.target.value)}
                required
              />
            </label>
          </div>

          <button type="button" className="text-button"
            onClick={() => removeRange(index)}>
            Remove this time
          </button>
        </fieldset>
      ))}

      <button
        type="button"
        className="secondary"
        onClick={addRange}
        disabled={busy || available.length >= 100}
      >
        + Add an available time
      </button>

      {!available.length && (
        <p>No available times selected. Saving will report no availability.</p>
      )}

      <button type="submit" disabled={busy || !name.trim()}>
        {busy ? 'Saving…' : 'Join and save availability'}
      </button>
    </form>
  );
}
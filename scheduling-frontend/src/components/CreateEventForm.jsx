import { useState } from 'react';

function currentMonth(timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(new Date());

  const get = (type) =>
    parts.find((part) => part.type === type).value;

  return `${get('year')}-${get('month')}`;
}

export default function CreateEventForm({ onCreate, busy }) {
  const [fields, setFields] = useState(() => ({
    name: '',
    description: '',
    month: currentMonth('America/Los_Angeles'),
    timeZone: 'America/Los_Angeles',
  }));

  function update(e) {
    const { name, value } = e.target;

    setFields((previous) => {
      const next = {
        ...previous,
        [name]: value,
      };

      if (name === 'timeZone') {
        next.month = currentMonth(value);
      }

      return next;
    });
  }

  async function submit(e) {
    e.preventDefault();

    if (!fields.name.trim()) {
      return;
    }

    await onCreate({
      ...fields,
      name: fields.name.trim(),
      description: fields.description.trim(),
    });
  }

  return (
    <form className="panel form" onSubmit={submit}>
      <div>
        <span className="eyebrow">START A PLAN</span>
        <h2>Make room for a good time.</h2>
        <p>
          Create an event for this month, then invite your friends.
        </p>
      </div>

      <label>
        Event name
        <input
          name="name"
          value={fields.name}
          onChange={update}
          placeholder="Game night"
          required
          maxLength={100}
          disabled={busy}
        />
      </label>

      <label>
        Description
        <textarea
          name="description"
          value={fields.description}
          onChange={update}
          placeholder="What should everyone know?"
          rows={3}
          maxLength={1000}
          disabled={busy}
        />
      </label>

      <div className="two-columns">
        <label>
          Current month
          <input
            type="month"
            name="month"
            value={fields.month}
            readOnly
          />
        </label>

        <label>
          Event time zone
          <select
            name="timeZone"
            value={fields.timeZone}
            onChange={update}
            disabled={busy}
          >
            <option value="America/Los_Angeles">
              Pacific — Los Angeles
            </option>
            <option value="America/Denver">
              Mountain — Denver
            </option>
            <option value="America/Chicago">
              Central — Chicago
            </option>
            <option value="America/New_York">
              Eastern — New York
            </option>
            <option value="UTC">UTC</option>
          </select>
        </label>
      </div>

      <button
        type="submit"
        disabled={busy || !fields.name.trim()}
      >
        {busy ? 'Creating…' : 'Create event →'}
      </button>
    </form>
  );
}
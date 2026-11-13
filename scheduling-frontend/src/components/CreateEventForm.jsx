import { useState } from 'react';

export default function CreateEventForm({ onCreate, busy }) {
  const [fields, setFields] = useState({ name: '', description: '', month: '2026-12', timeZone: 'America/Los_Angeles' });
  function update(event) { setFields({ ...fields, [event.target.name]: event.target.value }); }
  async function submit(event) {
    event.preventDefault();
    if (!fields.name.trim()) return;
    await onCreate({ ...fields, name: fields.name.trim(), description: fields.description.trim() });
  }
  return <form className="panel form" onSubmit={submit}>
    <div><span className="eyebrow">START A PLAN</span><h2>Make room for a good time.</h2><p>Add the basics. Your friends can help find the time.</p></div>
    <label>Event name<input name="name" value={fields.name} onChange={update} placeholder="Friday game night" required maxLength={100} /></label>
    <label>Description<textarea name="description" value={fields.description} onChange={update} placeholder="What should everyone know?" rows={3} maxLength={1000} /></label>
    <div className="two-columns">
      <label>Target month<input type="month" name="month" value={fields.month} onChange={update} required /></label>
      <label>Event time zone<select name="timeZone" value={fields.timeZone} onChange={update}>
        <option value="America/Los_Angeles">Pacific — Los Angeles</option>
        <option value="America/Denver">Mountain — Denver</option>
        <option value="America/Chicago">Central — Chicago</option>
        <option value="America/New_York">Eastern — New York</option>
        <option value="UTC">UTC</option>
      </select></label>
    </div>
    <button disabled={busy || !fields.name.trim()}>{busy ? 'Creating…' : 'Create event →'}</button>
  </form>;
}

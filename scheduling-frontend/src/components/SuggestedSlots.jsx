import { slotLabel } from '../lib/dates.js';

export default function SuggestedSlots({ summary, timeZone, selected, onSelect }) {
  return <section className="panel">
    <span className="eyebrow">FIND YOUR OVERLAP</span><h2>Suggested times</h2>
    <p>Based on {summary.sharedCount} of {summary.joinedCount} submitted calendars.</p>
    {summary.sharedCount < summary.joinedCount && <p className="notice">Some availability is still unknown.</p>}
    <div className="slot-list">
      {summary.slots.map((slot) => <button type="button" className={`slot ${selected?.start === slot.start ? 'active' : ''}`}
        key={slot.start} aria-pressed={selected?.start === slot.start} onClick={() => onSelect(slot)}>
        <span>{slotLabel(slot, timeZone)}</span><span aria-hidden="true">↗</span>
      </button>)}
      {!summary.slots.length && <p className="empty">No suggested times yet. In this starter, only the sample Game Night includes fixture slots.</p>}
    </div>
    <div className="preview" aria-live="polite"><strong>Time preview</strong><p>{selected ? slotLabel(selected, timeZone) : 'Select a suggested time to preview it.'}</p></div>
  </section>;
}

import { monthLabel } from '../lib/dates.js';

// A small native CSS calendar: no extra calendar library required.
export default function MonthCalendar({ month, slots, timeZone, selected, onSelect }) {
  const [year, monthNumber] = month.split('-').map(Number);
  const offset = new Date(Date.UTC(year, monthNumber - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  function dayOf(timestamp) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: 'numeric' })
      .formatToParts(new Date(timestamp));
    const get = (type) => parts.find((p) => p.type === type).value;
    return `${get('year')}-${get('month')}-${get('day')}`;
  }
  return <section className="panel">
    <div className="section-heading"><h2>{monthLabel(month)}</h2><span className="badge">Month view</span></div>
    <p>Highlighted days have suggested times. Select a day to preview a time.</p>
    <div className="calendar">
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => <span className="weekday" key={day}>{day}</span>)}
      {Array.from({ length: offset }, (_, i) => <span key={`empty-${i}`} />)}
      {Array.from({ length: days }, (_, i) => {
        const day = i + 1;
        const key = `${month}-${String(day).padStart(2, '0')}`;
        const matching = slots.filter((slot) => dayOf(slot.start) === key);
        const active = selected && dayOf(selected.start) === key;
        return <button type="button" key={day} className={`calendar-day ${matching.length ? 'has-slots' : ''} ${active ? 'selected' : ''}`}
          disabled={!matching.length} aria-label={`${key}${matching.length ? `, ${matching.length} suggested times` : ', no suggested times'}`}
          aria-pressed={Boolean(active)} onClick={() => onSelect(matching[0])}>{day}{matching.length > 0 && <span className="dot" />}</button>;
      })}
    </div>
    <p className="small">Times shown in {timeZone}.</p>
  </section>;
}

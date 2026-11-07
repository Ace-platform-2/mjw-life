import React, { useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { prettyDate, shiftDay, weekStart } from './model.js';

const dateLabel = (date, options) => new Intl.DateTimeFormat('en-ZA', {
  timeZone: 'Africa/Johannesburg', ...options,
}).format(new Date(date.length === 10 ? date + 'T12:00:00Z' : date));

export function Calendar({ records, day, areas, renderRow }) {
  const [cursor, setCursor] = useState(day);
  const [mode, setMode] = useState('week');
  const [area, setArea] = useState('');
  const month = cursor.slice(0, 7);
  const first = month + '-01';
  const start = weekStart(mode === 'week' ? cursor : first);
  const days = Array.from({ length: mode === 'week' ? 7 : 42 }, (_, index) => shiftDay(start, index));
  const dated = records.filter(item => (item.kind === 'task' || item.kind === 'bill') && (!area || item.area === area));
  const itemsOn = key => dated.filter(item => item.planned === key || item.due === key)
    .sort((a, b) => (a.startsAt || 'z').localeCompare(b.startsAt || 'z'));
  function move(direction) {
    if (mode === 'week') return setCursor(shiftDay(cursor, direction * 7));
    const next = new Date(first + 'T12:00:00Z');
    next.setUTCMonth(next.getUTCMonth() + direction);
    setCursor(next.toISOString().slice(0, 10));
  }
  return <div className="screen calendar-screen">
    <p className="eyebrow">See what’s coming</p><h1>Calendar</h1>
    <div className="calendar-controls">
      <div className="segmented" aria-label="Calendar view">
        {['week', 'month'].map(item => <button key={item} aria-pressed={mode === item} onClick={() => setMode(item)}>{item === 'week' ? 'Week' : 'Month'}</button>)}
      </div>
      <label>Life area<select value={area} onChange={event => setArea(event.target.value)}><option value="">All areas</option>{areas.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    </div>
    <div className="calendar-heading">
      <button className="quiet" aria-label={'Previous ' + mode} onClick={() => move(-1)}><CaretLeft size={22} /></button>
      <h2>{mode === 'month' ? dateLabel(cursor, { month: 'long', year: 'numeric' }) : prettyDate(start) + ' to ' + prettyDate(shiftDay(start, 6))}</h2>
      <button className="quiet" aria-label={'Next ' + mode} onClick={() => move(1)}><CaretRight size={22} /></button>
    </div>
    <div className="calendar-grid">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(label => <small key={label}>{label}</small>)}
      {days.map(key => {
        const items = itemsOn(key);
        const drafts = items.filter(item => item.suggested).length;
        return <button key={key} aria-pressed={cursor === key} aria-label={prettyDate(key) + ', ' + items.length + ' items'} className={key.slice(0, 7) !== month && mode === 'month' ? 'outside' : ''} onClick={() => setCursor(key)}>
          <strong>{Number(key.slice(-2))}</strong><small>{items.length ? items.length + (drafts === items.length ? ' draft' : ' items') : ''}</small>
        </button>;
      })}
    </div>
    <section className="agenda"><div className="section-actions"><h2>{prettyDate(cursor)}</h2><button className="quiet" onClick={() => setCursor(day)}>Jump to today</button></div>
      <small>Drafts are suggestions. Calendar entries marked RSVP pending still need a response.</small>
      {itemsOn(cursor).length ? <ul>{itemsOn(cursor).map(renderRow)}</ul> : <p className="muted">Nothing on the calendar for this day.</p>}
    </section>
  </div>;
}

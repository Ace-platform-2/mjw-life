import React, { useState } from 'react';
import { CaretLeft, CaretRight } from '@phosphor-icons/react';
import { prettyDate, shiftDay, weekStart } from './model.js';
import { billOccurrences, eventOn, eventTypes, isEvent, localTime, monthShift } from './planning.js';

const dateLabel = date => new Intl.DateTimeFormat('en-ZA', {
  timeZone: 'Africa/Johannesburg', month: 'long', year: 'numeric',
}).format(new Date(date + 'T12:00:00Z'));

export function Calendar({ records, day, initialDate, areas, open }) {
  const [cursor, setCursor] = useState(initialDate || day);
  const [mode, setMode] = useState('agenda');
  const [area, setArea] = useState('');
  const month = cursor.slice(0, 7);
  const start = weekStart(mode === 'month' ? month + '-01' : cursor);
  const days = Array.from({ length: mode === 'month' ? 42 : 7 }, (_, index) => shiftDay(start, index));
  const active = records.filter(item => !item.suggested && !item.completed && item.status !== 'done' && (!area || item.area === area));
  const billMonths = new Map();
  const dates = new Map();

  function itemsOn(key) {
    if (dates.has(key)) return dates.get(key);
    const monthKey = key.slice(0, 7);
    if (!billMonths.has(monthKey)) billMonths.set(monthKey, billOccurrences(records, monthKey));
    const items = [
      ...active.flatMap(item => {
        if (isEvent(item)) {
          const occurrence = eventOn(item, key);
          if (!occurrence) return [];
          const time = occurrence.startsAt && (occurrence.repeat || item.planned === key) ? localTime(occurrence.startsAt) : '';
          return [{ item, sort: time || '00:00', label: [time || (occurrence.startsAt ? 'Continues today' : 'All day'), eventTypes[item.eventType] || 'Event',
            item.provenance?.includes('RSVP pending') && 'Response needed'].filter(Boolean).join(' · ') }];
        }
        if (item.kind === 'house_item' && item.due === key) return [{ item, sort: '24:00', label: 'House · Due' }];
        if (item.kind !== 'task') return [];
        const labels = [item.due === key && 'Due', item.planned === key && 'Work on today', item.followup === key && item.status === 'waiting' && 'Follow up'].filter(Boolean);
        return labels.length ? [{ item, sort: '24:00', label: labels.join(' · ') }] : [];
      }),
      ...billMonths.get(monthKey).filter(item => !item.paid && item.due === key && (!area || item.bill.area === area))
        .map(({ bill }) => ({ item: bill, sort: '24:00', label: 'Bill due' })),
    ].sort((a, b) => a.sort.localeCompare(b.sort));
    dates.set(key, items);
    return items;
  }
  const next = Array.from({ length: 30 }, (_, index) => shiftDay(cursor, index + 1)).find(key => itemsOn(key).length);
  const selected = itemsOn(cursor);
  const agendaDays = mode === 'agenda' ? [cursor, ...Array.from({ length: 6 }, (_, index) => shiftDay(cursor, index + 1)).filter(key => itemsOn(key).length)] : [cursor];
  function move(direction) {
    if (mode === 'month') setCursor(monthShift(month, direction) + '-01');
    else setCursor(shiftDay(cursor, direction * 7));
  }
  const add = date => open({ kind: 'event', area: area || 'mornay', planned: date });
  return <div className="screen calendar-screen">
    <div className="page-heading"><h1>Calendar</h1><button className="secondary" onClick={() => add(cursor)}>Add event</button></div>
    <div className="calendar-controls">
      <div className="segmented" aria-label="Calendar view">
        {['agenda', 'week', 'month'].map(item => <button key={item} aria-pressed={mode === item} onClick={() => setMode(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}
      </div>
      <label>Area<select value={area} onChange={event => setArea(event.target.value)}><option value="">All areas</option>{areas.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    </div>
    <div className="calendar-heading">
      <button className="quiet" aria-label={mode === 'month' ? 'Previous month' : 'Previous week'} onClick={() => move(-1)}><CaretLeft size={22} /></button>
      <h2>{mode === 'month' ? dateLabel(cursor) : prettyDate(mode === 'agenda' ? cursor : start) + ' to ' + prettyDate(shiftDay(mode === 'agenda' ? cursor : start, 6))}</h2>
      <button className="quiet" aria-label={mode === 'month' ? 'Next month' : 'Next week'} onClick={() => move(1)}><CaretRight size={22} /></button>
    </div>
    {mode !== 'agenda' && <div className="calendar-grid">
      {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(label => <small key={label}>{label}</small>)}
      {days.map(key => {
        const items = itemsOn(key);
        return <button key={key} aria-pressed={cursor === key} aria-current={key === day ? 'date' : undefined}
          aria-label={prettyDate(key) + (key === day ? ', today' : '') + ', ' + items.length + ' scheduled'}
          className={key.slice(0, 7) !== month && mode === 'month' ? 'outside' : ''} onClick={() => setCursor(key)}>
          <strong>{Number(key.slice(-2))}</strong>
          {key === day ? <small>Today</small> : items.length > 0 && <span className="calendar-dot" aria-hidden="true" />}
        </button>;
      })}
    </div>}
    {cursor !== day && <button className="quiet" onClick={() => setCursor(day)}>Back to today</button>}
    {agendaDays.map(date => <section className="agenda" key={date}>
      <h2>{date === day ? 'Today · ' : ''}{prettyDate(date)}</h2>
      {itemsOn(date).length ? <ul>{itemsOn(date).map(({ item, label }) => <li className="row" key={item.id}>
        <button className="row-detail" onClick={() => open(item)}><span>{item.title}<small>{label}</small></span></button>
      </li>)}</ul> : <p className="muted">Nothing scheduled for this date.</p>}
    </section>)}
    {!selected.length && next && (mode !== 'agenda' || !agendaDays.includes(next)) && <button className="quiet" onClick={() => setCursor(next)}>Next scheduled day · {prettyDate(next)}</button>}
  </div>;
}

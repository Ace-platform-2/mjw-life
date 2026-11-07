import React, { useState } from 'react';
import { prettyDate } from './model.js';
import { medicationTimes } from './planning.js';
import { downloadFile } from './files.js';

const stamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

function reminders(schedule, day) {
  const events = schedule.flatMap(med => med.times.map(time => {
    const starts = new Date((med.day > day ? med.day : day) + 'T' + time + ':00+02:00');
    if (med.endedOn && med.endedOn <= (med.day > day ? med.day : day)) return '';
    const until = med.endedOn ? ';UNTIL=' + stamp(new Date(Date.parse(med.endedOn + 'T00:00:00+02:00') - 1000)) : '';
    return ['BEGIN:VEVENT', 'UID:' + med.id + '-' + time.replace(':', '') + '@mjw-life.vercel.app', 'DTSTAMP:' + stamp(new Date()),
      'DTSTART:' + stamp(starts), 'DURATION:PT5M', 'RRULE:FREQ=DAILY' + until, 'SUMMARY:Medication check-in',
      'BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:Medication check-in', 'END:VALARM', 'END:VEVENT'].join('\r\n');
  })).filter(Boolean);
  for (const med of schedule.filter(item => item.refill && item.refill >= day)) {
    events.push(['BEGIN:VEVENT', 'UID:' + med.id + '-refill-' + med.refill + '@mjw-life.vercel.app',
      'DTSTAMP:' + stamp(new Date()), 'DTSTART;VALUE=DATE:' + med.refill.replace(/-/g, ''),
      'DURATION:P1D', 'SUMMARY:Medication refill', 'BEGIN:VALARM', 'TRIGGER:-P1D', 'ACTION:DISPLAY',
      'DESCRIPTION:Medication refill', 'END:VALARM', 'END:VEVENT'].join('\r\n'));
  }
  downloadFile(['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MJW Life//Personal reminders//EN', ...events, 'END:VCALENDAR', ''].join('\r\n'),
    'mjw-medication-reminders.ics', 'text/calendar');
}

export function Medication({ records, day, area, open, save, busy }) {
  const [logDay, setLogDay] = useState(day);
  const schedule = records.filter(item => item.kind === 'medication' && item.area === area);
  const doses = medicationTimes(schedule, day);
  const history = records.filter(item => item.kind === 'dose' && item.area === area && item.day === logDay)
    .sort((a, b) => a.time.localeCompare(b.time));
  const recordDose = ({ med, time, id }, status) => save({ id, kind: 'dose', area, relatedId: med.id, title: med.title, strength: med.strength,
    day, time, status, loggedAt: new Date().toISOString() });
  return <section className="feature-section">
    <div className="section-actions"><h2>Medication</h2><button className="quiet" onClick={() => open({ kind: 'medication', area })}>Add medication</button></div>
    <p className="muted">Your private schedule, refill dates and check-ins.</p>
    <ul>{schedule.map(item => <li className="row" key={item.id}><button className="row-detail" onClick={() => open(item)}><span>{item.title}<small>{item.times.join(', ')}{item.refill ? ' · ' + (item.refill <= day ? 'Refill due ' : 'Refill ') + prettyDate(item.refill) : ''}{item.endedOn && item.endedOn <= day ? ' · Stopped' : ''}</small></span></button></li>)}</ul>
    {doses.length > 0 && <>
      <h3 className="section-heading">Today’s doses</h3>
      <ul>{doses.map(entry => {
        const logged = records.find(item => item.id === entry.id);
        return <li className="row dose-row" key={entry.id}><span>{entry.time} · {entry.med.title}<small>{logged?.status === 'taken' ? 'Taken' : logged?.status === 'skipped' ? 'Skipped' : 'Not logged'}</small></span>
          {logged ? <button className="quiet" disabled={busy} onClick={() => save(logged, true)}>Undo log</button>
            : <span className="section-actions"><button className="quiet" disabled={busy} onClick={() => recordDose(entry, 'taken')}>Log taken</button><button className="quiet" disabled={busy} onClick={() => recordDose(entry, 'skipped')}>Log skipped</button></span>}
        </li>;
      })}</ul>
    </>}
    {schedule.some(item => !item.endedOn || item.endedOn > day || item.refill && item.refill >= day) && <details><summary>Calendar reminders</summary>
      <p>Download reminders with a generic title, then import them into your calendar and verify its notifications. Update the calendar if your schedule changes.</p>
      <button className="secondary" onClick={() => reminders(schedule, day)}>Download calendar reminders</button>
    </details>}
    {schedule.length > 0 && <details><summary>Dose history</summary>
      <label>History date<input type="date" max={day} value={logDay} onChange={event => setLogDay(event.target.value)} /></label>
      {history.length ? <ul>{history.map(item => <li className="row" key={item.id}>{item.time} · {item.title} · {item.status === 'taken' ? 'Taken' : 'Skipped'}</li>)}</ul> : <p className="muted">No doses logged for this date.</p>}
    </details>}
  </section>;
}

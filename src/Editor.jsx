import React, { useEffect, useRef, useState } from 'react';
import { DetailFields, detailRecord, isDetail } from './DetailFields.jsx';
import { dateKey } from './model.js';
import { downloadFile, eventCalendarFile } from './files.js';
import { eventTypes, isEvent, localTime } from './planning.js';

export const labels = {
  task: 'Task', event: 'Event', note: 'Note', journal: 'Journal entry', document: 'Document',
  bill: 'Bill', budget: 'Budget category', expense: 'Spending', medication: 'Medication',
  goal: 'Goal', habit: 'Habit', area: 'Area', capacity: 'Available time',
  review: 'Weekly review', balance: 'Bank balance',
  person: 'Family member', emergency: 'Emergency card', house_item: 'House item',
  bank_account: 'Bank account', travel: 'Travel entry', tax_receipt: 'Receipt',
};
const capture = ['task', 'event', 'note', 'journal', 'document', 'goal', 'habit', 'bill', 'expense', 'medication', 'house_item', 'travel', 'tax_receipt'];

export function Dialog({ title, close, busy, children }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); if (!busy) close(); }} aria-labelledby="dialog-title">
    <div className="dialog-header"><h2 id="dialog-title">{title}</h2><button className="quiet" type="button" disabled={busy} onClick={close}>Close</button></div>
    {children}
  </dialog>;
}

export function Editor({ item, day, areas, busy, error, close, save, saveDocument, downloadDocument, related, open }) {
  const [kind, setKind] = useState(isEvent(item) ? 'event' : item.kind);
  const [type, setType] = useState(item.eventType || 'event');
  const [validation, setValidation] = useState('');
  const [processing, setProcessing] = useState(false);
  const [times, setTimes] = useState(item.times || ['']);
  const [allDay, setAllDay] = useState(Boolean(item.calendarOnly || (item.id && isEvent(item) && !item.startsAt)));
  const [scheduled, setScheduled] = useState(Boolean(item.start || item.end || !Number.isFinite(item.minutes)));
  const titled = capture.includes(kind) || kind === 'area' || kind === 'budget' || isDetail(kind);
  const assigned = capture.includes(kind) && !isDetail(kind);
  const title = item.id ? 'Edit ' + labels[kind].toLowerCase() : capture.includes(kind) ? 'Add ' + labels[kind].toLowerCase() : labels[kind];
  const endDayDefault = item.endDay || (item.endsAt ? dateKey(new Date(item.endsAt)) : '');
  const amount = ['bill', 'balance', 'budget', 'expense'].includes(kind);

  async function submit(event) {
    event.preventDefault();
    if (processing || busy) return;
    const fields = new FormData(event.currentTarget);
    const get = name => String(fields.get(name) ?? '').trim();
    setValidation('');
    const record = { ...item, id: item.id || crypto.randomUUID(), kind };
    if (titled) {
      record.title = get('title');
      if (!record.title) return setValidation('Enter a title.');
    }
    if (assigned) record.area = get('area');
    if (isDetail(kind)) {
      setProcessing(true);
      try {
        await detailRecord(record, fields, day);
        const file = fields.get('file');
        const success = kind === 'tax_receipt' && file?.size ? await saveDocument(record, file) : await save(record);
        if (success) close();
      } catch (error) { setValidation(error.message || 'Could not save this entry.'); }
      finally { setProcessing(false); }
      return;
    }
    if (kind === 'task') {
      Object.assign(record, { due: get('due'), planned: get('planned'), minutes: Number(get('minutes')), owner: get('owner'),
        status: get('status'), essential: fields.has('essential'), followup: get('followup'), detail: get('detail') });
      if (item.suggested && fields.has('acceptDraft')) {
        record.suggested = false;
        record.provenance = 'Accepted suggestion';
      }
      record.completed = record.status === 'done' ? item.completed || day : '';
    }
    if (kind === 'event') {
      const planned = get('planned');
      const endDay = get('endDay') || planned;
      const untimed = type === 'birthday' || allDay;
      if (endDay < planned) return setValidation('The end date must be on or after the start date.');
      Object.assign(record, { eventType: type, planned, endDay: type === 'birthday' ? planned : endDay,
        detail: get('detail'), place: get('place'), repeat: type === 'birthday' ? 'yearly' : get('repeat'), calendarOnly: untimed,
        startsAt: untimed ? '' : planned + 'T' + get('start') + ':00+02:00',
        endsAt: untimed ? '' : endDay + 'T' + get('end') + ':00+02:00' });
      if (!untimed && Date.parse(record.startsAt) >= Date.parse(record.endsAt)) return setValidation('The event must end after it starts.');
      if (record.repeat && endDay !== planned) return setValidation('Repeating events must start and end on the same day.');
    }
    if (kind === 'goal') {
      Object.assign(record, { progress: Number(get('progress')), target: Number(get('target')) });
      if (record.progress > record.target) return setValidation('Completed milestones cannot exceed the target.');
    }
    if (kind === 'capacity') {
      const start = get('start');
      const end = get('end');
      if (scheduled && Boolean(start) !== Boolean(end)) return setValidation('Enter both the start and end time.');
      if (scheduled && start && end <= start) return setValidation('The end time must be later than the start time.');
      Object.assign(record, { start, end, minutes: !scheduled && get('minutes') !== '' ? Number(get('minutes')) : null,
        essentials: fields.has('essentials'), focusId: get('focusId') || item.focusId || '' });
    }
    if (['area', 'review', 'note', 'journal', 'medication'].includes(kind)) record.detail = get('detail');
    if (['note', 'journal'].includes(kind)) Object.assign(record, { day: get('day'), tags: get('tags') });
    if (amount) record.amount = Math.round(Number(get('amount')) * 100);
    if (kind === 'balance' || kind === 'expense') record.day = get('day');
    if (kind === 'budget') Object.assign(record, { area: 'finance', month: get('month') });
    if (kind === 'expense' || kind === 'bill') record.category = get('category');
    if (kind === 'bill') Object.assign(record, { due: get('due'), repeat: fields.has('monthly') ? 'monthly' : '', paid: Boolean(item.paid) });
    if (kind === 'medication') {
      const unique = [...new Set(times.filter(Boolean))].sort();
      const started = get('day');
      const ended = get('endedOn');
      if (!unique.length || unique.length !== times.length) return setValidation('Enter distinct times for each scheduled dose.');
      if (ended && ended < started) return setValidation('The end date cannot come before the start date.');
      Object.assign(record, { day: started, endedOn: ended, times: unique, refill: get('refill'), strength: get('strength') });
    }
    if (kind === 'document') {
      record.detail = get('detail');
      record.day = item.day || day;
      if (get('url')) {
        try {
          if (new URL(get('url')).protocol !== 'https:') throw new Error();
          record.url = get('url');
        } catch { return setValidation('Use a valid HTTPS document link.'); }
      } else {
        delete record.url;
      }
      const file = fields.get('file');
      if (!record.url && !record.path && !file?.size) return setValidation('Choose a file or enter a link.');
      if (file?.size && record.url) return setValidation('Choose either a file or a link.');
      if (file?.size) { if (await saveDocument(record, file)) close(); return; }
    }
    if (await save(record)) close();
  }

  const note = (label = 'Notes', required = false) => <label>{label}<textarea name="detail" defaultValue={item.detail} maxLength={30000} rows="4" required={required} /></label>;
  return <Dialog title={title} close={close} busy={busy || processing}>
    <form onSubmit={submit} key={kind}>
      {!item.id && capture.includes(kind) && <label>Type<select value={kind} onChange={event => { setKind(event.target.value); setValidation(''); }}>
        {capture.map(id => <option key={id} value={id}>{labels[id]}</option>)}
      </select></label>}
      {titled && <label>{({ budget: 'Category', medication: 'Medication name', person: 'Full name', emergency: 'Your name', bank_account: 'Account nickname', travel: 'Purpose or label', tax_receipt: 'Supplier or expense' })[kind] || 'Title'}<input name="title" defaultValue={item.title} required maxLength={180} /></label>}
      {assigned && <label>Area<select name="area" defaultValue={['bill', 'expense'].includes(kind) ? 'finance' : item.area || 'mornay'}>{areas.map(area => <option key={area.id} value={area.id}>{area.title}</option>)}</select></label>}
      {kind === 'task' && <details open={item.id || item.planned || item.suggested ? true : undefined}>
        <summary>Schedule and details</summary>
        <div className="fields">
          <label>Work on<input type="date" name="planned" defaultValue={item.planned} /></label>
          <label>Due date<input type="date" name="due" defaultValue={item.due} /></label>
          <label>Estimated minutes<input type="number" name="minutes" min="0" max="1440" defaultValue={item.minutes ?? ''} /></label>
          <label>Owner<input name="owner" placeholder="Me" maxLength={100} defaultValue={item.owner} /></label>
          <label>Status<select name="status" defaultValue={item.status || 'open'}><option value="open">Open</option><option value="waiting">Waiting on someone</option><option value="escalated">Escalated</option><option value="done">Done</option></select></label>
          <label>Follow up on<input type="date" name="followup" defaultValue={item.followup} /></label>
          <label className="tick"><input type="checkbox" name="essential" defaultChecked={item.essential} /> Essential</label>
          {item.suggested && <label className="tick"><input type="checkbox" name="acceptDraft" /> Add to my plan</label>}
          {item.provenance && <small>{item.provenance}</small>}
          {note()}
        </div>
      </details>}
      {kind === 'event' && <>
        <label>Event type<select value={type} onChange={event => setType(event.target.value)}>{Object.entries(eventTypes).map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></label>
        <label>Date<input type="date" name="planned" defaultValue={item.planned || day} required /></label>
        {type !== 'birthday' && <>
          <label className="tick"><input type="checkbox" checked={allDay} onChange={event => setAllDay(event.target.checked)} /> All day</label>
          {!allDay && <div className="two-fields"><label>Starts (SAST)<input type="time" name="start" defaultValue={item.startsAt ? localTime(item.startsAt) : ''} required /></label>
            <label>Ends (SAST)<input type="time" name="end" defaultValue={item.endsAt ? localTime(item.endsAt) : ''} required /></label></div>}
          <label>End date if different<input type="date" name="endDay" defaultValue={endDayDefault === item.planned ? '' : endDayDefault} /></label>
          <label>Repeat<select name="repeat" defaultValue={item.repeat || ''}><option value="">Never</option><option value="weekly">Every week</option><option value="yearly">Every year</option></select></label>
          <label>Location or meeting link<input name="place" defaultValue={item.place} maxLength={500} /></label>
        </>}
        {item.provenance && <small>{item.provenance}</small>}
        {note()}
      </>}
      {kind === 'capacity' && <>
        <label className="tick"><input type="checkbox" checked={scheduled} onChange={event => setScheduled(event.target.checked)} /> Subtract scheduled events from my day</label>
        {scheduled ? <div className="two-fields"><label>Day starts<input type="time" name="start" defaultValue={item.start} /></label><label>Day ends<input type="time" name="end" defaultValue={item.end} /></label></div>
          : <label>Available minutes<input type="number" name="minutes" min="0" max="1440" defaultValue={item.minutes ?? ''} /></label>}
        <label className="tick"><input type="checkbox" name="essentials" defaultChecked={item.essentials} /> Show essentials only today</label>
      </>}
      {kind === 'goal' && <><label>Milestone target<input type="number" name="target" min="1" max="1000" defaultValue={item.target ?? 3} required /></label><label>Completed milestones<input type="number" name="progress" min="0" max="1000" defaultValue={item.progress ?? 0} required /></label></>}
      {['note', 'journal', 'balance', 'expense', 'medication'].includes(kind) && <label>{kind === 'medication' ? 'Start date' : 'Date'}<input type="date" name="day" defaultValue={item.day || day} required /></label>}
      {['note', 'journal'].includes(kind) && <><label>Tags<input name="tags" defaultValue={item.tags} maxLength={160} /></label>{note(kind === 'journal' ? 'Reflection' : 'Note', true)}</>}
      {kind === 'area' && note('Description')}
      {kind === 'review' && note('What went well? What needs to move?', true)}
      {amount && <label>Amount (R)<input type="number" name="amount" min={kind === 'balance' ? '-1000000000' : '0'} max="1000000000" step="0.01" defaultValue={item.amount === undefined ? '' : item.amount / 100} required /></label>}
      {kind === 'budget' && <label>Month<input type="month" name="month" defaultValue={item.month || day.slice(0, 7)} required /></label>}
      {['expense', 'bill'].includes(kind) && <label>Spending category<input name="category" defaultValue={item.category} maxLength={80} placeholder="e.g. Groceries" /></label>}
      {kind === 'bill' && <><label>First due date<input type="date" name="due" min="1900-01-01" max="2100-12-31" defaultValue={item.due || day} required /></label><label className="tick"><input type="checkbox" name="monthly" defaultChecked={item.repeat === 'monthly'} /> Repeat monthly</label></>}
      {kind === 'medication' && <>
        <label>Instructions from your prescription<input name="strength" maxLength={180} defaultValue={item.strength} /></label>
        <small>Enter your existing schedule. Review changes with the clinician who manages it.</small>
        {times.map((value, index) => <div className="section-actions" key={index}><label>Dose time {index + 1}<input type="time" required value={value} onChange={event => setTimes(times.map((time, i) => i === index ? event.target.value : time))} /></label>
          {times.length > 1 && <button className="quiet" type="button" onClick={() => setTimes(times.filter((_, i) => i !== index))}>Remove time</button>}</div>)}
        <button className="secondary" type="button" disabled={times.length >= 12} onClick={() => setTimes([...times, ''])}>Add dose time</button>
        <label>Refill date<input type="date" name="refill" defaultValue={item.refill} /></label>
        <label>Stop scheduling from<input type="date" name="endedOn" defaultValue={item.endedOn} /></label>{note()}
      </>}
      {kind === 'document' && <>
        {!item.path && <><label>Upload a file<input type="file" name="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx" /></label>
          <small>PDF, images, text, CSV, Word and Excel up to 10 MB.</small>
          <label>Or link a document<input type="url" name="url" defaultValue={item.url} placeholder="https://" /></label></>}
        {item.path && <><small>{item.filename || 'Uploaded file'}</small><button className="quiet" type="button" onClick={async () => {
          if (!await downloadDocument(item)) setValidation('Could not download this document.');
        }}>Download file</button></>}
        {item.url && !item.path && /^https:\/\//i.test(item.url) && <a className="quiet" href={item.url} target="_blank" rel="noopener noreferrer">Open document link</a>}
        {note('Description')}
      </>}
      {isDetail(kind) && <DetailFields kind={kind} item={{ ...item, day: item.day || day }} day={day} />}
      {kind === 'tax_receipt' && item.path && <button className="quiet" type="button" onClick={async () => {
        if (!await downloadDocument(item)) setValidation('Could not download this receipt.');
      }}>Download receipt</button>}
      {(error || validation) && <p role="alert" className="warning">{validation || error}</p>}
      <button className="primary" disabled={busy || processing}>{busy || processing ? 'Saving…' : 'Save'}</button>
      {item.id && !['capacity', 'area', 'emergency'].includes(kind) && <button type="button" className="quiet" disabled={busy} onClick={async () => {
        if (window.confirm('Delete this ' + labels[kind].toLowerCase() + '?') && await save(item, true)) close();
      }}>Delete {labels[kind].toLowerCase()}</button>}
    </form>
    {item.id && kind === 'event' && item.planned && <details className="linked"><summary>Calendar reminder</summary>
      <p className="muted">Download this event and import it into your calendar. Check that its reminder is enabled there.</p>
      <button className="secondary" type="button" onClick={() => downloadFile(eventCalendarFile(item), 'mjw-event.ics', 'text/calendar')}>Download event reminder</button>
    </details>}
    {item.id && ['event', 'task', 'note', 'journal', 'house_item', 'tax_receipt'].includes(kind) && <section className="linked">
      <h3>Related items</h3>
      <div className="section-actions">
        {kind === 'note' && <button className="quiet" disabled={busy} onClick={() => open({ kind: 'task', area: item.area, relatedId: item.id })}>Create follow-up</button>}
        {kind !== 'note' && <button className="quiet" disabled={busy} onClick={() => open({ kind: 'note', area: item.area, relatedId: item.id })}>Add note</button>}
        <button className="quiet" disabled={busy} onClick={() => open({ kind: 'document', area: item.area, relatedId: item.id })}>Attach document</button>
      </div>
      {related.map(record => <button key={record.id} className="quiet" disabled={busy} onClick={() => open(record)}>{record.title}</button>)}
    </section>}
  </Dialog>;
}

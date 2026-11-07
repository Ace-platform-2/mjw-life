import React, { useState } from 'react';
import { dateKey, prettyDate } from './model.js';
import { isEvent } from './planning.js';
import { downloadFile } from './files.js';
import { GoogleSources } from './GoogleSources.jsx';
import { Transcription } from './Transcription.jsx';

export const inInbox = item => item.kind === 'task' && !isEvent(item) && !item.completed && item.status !== 'done' &&
  !item.dismissed && (item.suggested || (!item.planned && item.status === 'open'));

export function Inbox({ records, day, open, save, busy, refresh }) {
  const all = records.filter(inInbox);
  const [limits, setLimits] = useState({});
  const groups = [
    ['Unscheduled tasks', all.filter(item => !item.suggested)],
    ['Email follow-ups', all.filter(item => item.suggested && item.source === 'Gmail')],
    ['Planning suggestions', all.filter(item => item.suggested && item.source !== 'Gmail')],
  ];
  return <div className="screen inside">
    <div className="page-heading"><h1>Inbox</h1><button className="secondary" onClick={() => open({ kind: 'task' })}>Add task</button></div>
    {refresh}
    <p className="muted">Choose what to plan now and what can wait.</p>
    {!all.length && <p>Your inbox is clear.</p>}
    {groups.filter(([, items]) => items.length).map(([title, items]) => <section key={title} className="feature-section">
      <h2>{title} <small>({items.length})</small></h2>
      <ul>{items.slice(0, limits[title] || 8).map(item => <li className="row inbox-row" key={item.id}>
        <button className="row-detail" onClick={() => open(item)}><span>{item.title}{item.planned ? <small>Suggested for {prettyDate(item.planned)}</small> : item.receivedOn && <small>Received {prettyDate(item.receivedOn)}</small>}</span></button>
        <div className="section-actions">
          <button className="quiet" disabled={busy} onClick={() => save({ ...item, planned: day, suggested: false, provenance: item.suggested ? 'Accepted suggestion' : item.provenance })}>Plan today</button>
          {item.suggested && <button className="quiet" disabled={busy} onClick={() => save({ ...item, dismissed: true })}>Dismiss</button>}
        </div>
      </li>)}</ul>
      {items.length > (limits[title] || 8) && <button className="quiet" onClick={() => setLimits({ ...limits, [title]: (limits[title] || 8) + 8 })}>Show more {title.toLowerCase()}</button>}
    </section>)}
  </div>;
}

export function Records({ records, areas, day, open, downloadDocument, userId = 'demo', initialKind = 'note' }) {
  const [kind, setKind] = useState(initialKind);
  const [query, setQuery] = useState('');
  const [area, setArea] = useState('');
  const [date, setDate] = useState('');
  const [message, setMessage] = useState('');
  const labels = { note: 'Notes', journal: 'Journal', document: 'Documents', audio: 'Audio' };
  const filtered = records.filter(item => item.kind === kind && (!area || item.area === area) &&
    (!date || item.day === date) && [item.title, item.detail, item.tags].join(' ').toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (b.day || '').localeCompare(a.day || ''));
  return <div className="screen inside">
    <div className="page-heading"><h1>Records</h1>{kind !== 'audio' && <button className="secondary" onClick={() => open({ kind, area: area || 'mornay' })}>Add {kind === 'journal' ? 'entry' : kind}</button>}</div>
    <div className="segmented record-tabs" aria-label="Record type">{Object.entries(labels).map(([id, label]) => <button key={id} aria-pressed={kind === id} onClick={() => { setKind(id); setMessage(''); }}>{label}</button>)}</div>
    {kind === 'audio' ? <Transcription areas={areas} records={records} day={day} open={open} ownerId={userId} /> : <>
      <label>Search {labels[kind].toLowerCase()}<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Title, content or tag" /></label>
      <div className="two-fields">
        <label>Area<select value={area} onChange={event => setArea(event.target.value)}><option value="">All areas</option>{areas.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
        <label>Date<input type="date" value={date} onChange={event => setDate(event.target.value)} /></label>
      </div>
      {kind === 'journal' && <details><summary>Reflection prompt</summary><p>What helped today, and what could be easier tomorrow?</p>
        <button className="quiet" onClick={() => open({ kind, area: area || 'mornay', title: 'Today’s reflection' })}>Write a reflection</button></details>}
      {!filtered.length && <p className="muted">No matching {labels[kind].toLowerCase()}.</p>}
      <ul>{filtered.map(item => <li className="row" key={item.id}>
        <button className="row-detail" onClick={() => open(item)}><span>{item.title}<small>{item.day}{item.tags ? ' · ' + item.tags : ''}</small></span></button>
        {item.kind === 'document' && (/^https:\/\//i.test(item.url || '') ? <a className="quiet" href={item.url} target="_blank" rel="noopener noreferrer">Open link</a>
          : <button className="quiet" onClick={async () => { setMessage(''); if (!await downloadDocument(item)) setMessage('Could not download this document.'); }}>Download</button>)}
      </li>)}</ul>
      {message && <p role="status">{message}</p>}
    </>}
  </div>;
}

export function Settings({ areas, records, importRecords, signOut }) {
  const [area, setArea] = useState('');
  const [selected, setSelected] = useState(false);
  const exportRecords = () => {
    const itemIds = new Set(records.filter(item => item.area === area || item.id === area).map(item => item.id));
    const entries = records.filter(item => itemIds.has(item.id) || (item.kind === 'checkin' && itemIds.has(item.habit)))
      .map(item => {
        if (item.kind !== 'bank_account') return item;
        const { vault, ...masked } = item;
        return masked;
      });
    downloadFile(JSON.stringify({ area, exportedOn: dateKey(), records: entries }, null, 2), 'mjw-life-' + area.replace(/[^a-z0-9-]/gi, '') + '.json');
  };
  return <div className="screen inside">
    <h1>Settings</h1>
    <GoogleSources areas={areas} records={records} importRecords={importRecords} />
    <section className="feature-section">
      <h2>Export by area</h2>
      <p className="muted">Choose the area you want to export. The export contains record text, attachment references and masked account numbers. Download files separately from Documents.</p>
      <label>Area<select value={area} onChange={event => { setArea(event.target.value); setSelected(false); }}><option value="">Select area</option>{areas.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
      {area && <label className="tick"><input type="checkbox" checked={selected} onChange={event => setSelected(event.target.checked)} /> Include private details from this area in the export.</label>}
      <button className="secondary" disabled={!area || !selected} onClick={exportRecords}>Download area data</button>
    </section>
    {signOut && <section className="feature-section"><h2>Account</h2><button className="secondary" onClick={signOut}>Sign out</button></section>}
  </div>;
}

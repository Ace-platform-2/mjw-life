import React, { useState } from 'react';
import { dateKey, shiftDay } from './model.js';

const scopes = {
  calendar: 'https://www.googleapis.com/auth/calendar.events.readonly',
  gmail: 'https://www.googleapis.com/auth/gmail.readonly',
};
const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
let scriptReady;

function loadGoogle() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!scriptReady) scriptReady = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = resolve;
    script.onerror = () => { script.remove(); scriptReady = undefined; reject(new Error('Google sign-in could not load.')); };
    document.head.append(script);
  });
  return scriptReady;
}

async function requestToken(source) {
  await loadGoogle();
  return new Promise((resolve, reject) => {
    const google = window.google.accounts.oauth2;
    const client = google.initTokenClient({
      client_id: clientId,
      scope: scopes[source],
      include_granted_scopes: false,
      callback: response => {
        if (response.error || !response.access_token) reject(new Error('Google access was not granted.'));
        else resolve(response.access_token);
      },
      error_callback: () => reject(new Error('The Google consent window closed or could not open.')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

async function googleGet(path, token, params = {}) {
  const url = new URL(path);
  url.search = new URLSearchParams(params);
  const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (!response.ok) throw new Error('Google could not return your records. Check the account and app permissions.');
  return response.json();
}

async function calendarPreview(token) {
  const today = dateKey();
  const entries = [];
  let pageToken;
  do {
    const page = await googleGet('https://www.googleapis.com/calendar/v3/calendars/primary/events', token, {
      timeMin: today + 'T00:00:00+02:00',
      timeMax: shiftDay(today, 30) + 'T00:00:00+02:00',
      singleEvents: 'true', orderBy: 'startTime', maxResults: '100',
      fields: 'nextPageToken,items(id,summary,status,start,end,attendees(self,responseStatus))',
      ...(pageToken ? { pageToken } : {}),
    });
    for (const event of page.items || []) {
      const rsvp = event.attendees?.find(attendee => attendee.self)?.responseStatus;
      const start = event.start?.dateTime;
      const planned = event.start?.date || (start && dateKey(new Date(start)));
      if (!planned || rsvp === 'declined' || event.status === 'cancelled') continue;
      entries.push({
        id: 'gcal:' + event.id, kind: 'event', eventType: 'event', title: event.summary || 'Calendar event', planned,
        ...(start ? { startsAt: start, endsAt: event.end?.dateTime } : { calendarOnly: true }),
        status: 'open', source: 'Google Calendar',
        provenance: rsvp === 'needsAction' ? 'Calendar · RSVP pending' : 'Calendar · scheduled',
      });
    }
    pageToken = page.nextPageToken;
  } while (pageToken && entries.length < 100);
  return entries.slice(0, 100);
}

async function gmailPreview(token, query) {
  const endpoint = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
  const page = await googleGet(endpoint, token, { q: query, maxResults: '15', fields: 'messages(id)' });
  return Promise.all((page.messages || []).map(async ({ id }) => {
    const message = await googleGet(endpoint + '/' + encodeURIComponent(id), token, {
      format: 'metadata', metadataHeaders: 'Subject', fields: 'payload(headers)',
    });
    return {
      id: 'gmail:' + id, kind: 'task', title: message.payload?.headers?.find(header => header.name.toLowerCase() === 'subject')?.value || 'Email follow-up',
      status: 'open', planned: dateKey(), suggested: true, source: 'Gmail', provenance: 'Gmail · follow-up draft',
    };
  }));
}

export function GoogleSources({ areas, records, importRecords }) {
  const [area, setArea] = useState(areas[0]?.id || '');
  const [query, setQuery] = useState('newer_than:14d -category:promotions');
  const [entries, setEntries] = useState([]);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  async function preview(source) {
    setBusy(true);
    setMessage('');
    setEntries([]);
    setSelected([]);
    try {
      const token = await requestToken(source);
      const result = source === 'calendar' ? await calendarPreview(token) : await gmailPreview(token, query.trim());
      const normal = title => title.replace(/^FW:\s*(\[EXTERNAL\])?\s*/i, '').replace(/^[^\p{L}\p{N}]+/u, '').trim().toLowerCase();
      const unseen = result.filter(item => !records.some(record => record.id === item.id ||
        (item.source === 'Google Calendar' && record.source === item.source && record.planned === item.planned &&
          (!record.startsAt && !item.startsAt || Date.parse(record.startsAt) === Date.parse(item.startsAt)) && normal(record.title) === normal(item.title))));
      setEntries(unseen);
      if (!unseen.length) setMessage('No new matching items.');
    } catch (error) {
      setMessage(error.message || 'Google access is unavailable.');
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    try {
      const importedAt = new Date().toISOString();
      const batch = entries.filter(item => selected.includes(item.id)).map(item => ({ ...item, area, importedAt }));
      if (await importRecords(batch)) {
        setEntries(entries.filter(item => !selected.includes(item.id)));
        setSelected([]);
        setMessage(batch.length + ' items added to your private workspace.');
      } else setMessage('Could not import the selected items. Try again.');
    } finally {
      setBusy(false);
    }
  }

  const lastImport = records.map(item => item.importedAt).filter(Boolean).sort().at(-1);
  return <section className="google-sources">
    <h2>Connected accounts</h2><h3>Google</h3>
    <p className="muted">Preview the next 30 days from your primary Google Calendar or find Gmail messages to turn into draft follow-ups. You choose what to save.</p>
    {lastImport && <p>Last imported {new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(lastImport))}</p>}
    {!clientId ? <p>Google connection is awaiting setup.</p> : <>
      <label>Save to area<select value={area} onChange={event => setArea(event.target.value)}>{areas.map(item => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
      <label>Gmail search<input value={query} onChange={event => setQuery(event.target.value)} maxLength={300} /></label>
      <div className="section-actions"><button className="secondary" disabled={busy} onClick={() => preview('calendar')}>Preview Google Calendar</button><button className="secondary" disabled={busy || !query.trim()} onClick={() => preview('gmail')}>Preview Gmail</button></div>
      {entries.length > 0 && <>
        <ul>{entries.map(item => <li className="row" key={item.id}><label className="tick"><input type="checkbox" checked={selected.includes(item.id)} disabled={busy} onChange={event => setSelected(event.target.checked ? [...selected, item.id] : selected.filter(id => id !== item.id))} />{item.title} · {item.planned}</label></li>)}</ul>
        <button className="primary" disabled={busy || !selected.length} onClick={save}>Import selected ({selected.length})</button>
      </>}
      {message && <p role="status">{message}</p>}
    </>}
  </section>;
}

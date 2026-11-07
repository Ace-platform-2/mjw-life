import React, { useEffect, useRef, useState } from 'react';
import { ArrowsClockwise } from '@phosphor-icons/react';
import { clientId, loadGoogle, requestToken } from './GoogleSources.jsx';
import { collectGmail, gmailKey, gmailRequest } from './gmail.js';

export function GmailRefresh({ records, areas, readCheckpoint, commit, settings }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [area, setArea] = useState(areas[0]?.id || 'mornay');
  const access = useRef(null);
  const pending = useRef(false);
  const last = records.filter(item => item.kind === 'gmail_sync').sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))[0];

  useEffect(() => { if (clientId) loadGoogle().catch(() => {}); }, []);

  async function refresh() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setMessage('Checking Gmail…');
    try {
      if (!access.current || access.current.expires < Date.now() + 30000) access.current = await requestToken('gmail');
      const get = (path, parameters) => gmailRequest(access.current.token, path, parameters);
      const checkedAt = new Date().toISOString();
      const profile = await get('/profile', { fields: 'emailAddress,historyId' });
      const key = 'gmail-sync:' + await gmailKey(profile.emailAddress);
      const previous = await readCheckpoint(key);
      const { messages, checkpoint } = await collectGmail(get, profile, previous, area, checkedAt, new Set(records.map(item => item.id)),
        (count, total) => setMessage('Reading email subjects ' + count + ' / ' + total + '…'));
      await commit(key, previous?.runId, checkpoint, messages);
      setMessage(messages.length ? messages.length + (messages.length === 1 ? ' new email added' : ' new emails added') : 'Gmail is up to date.');
    } catch (error) {
      access.current = null;
      setMessage(error.message || 'Could not refresh Gmail.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return <section className="gmail-refresh">
    <div className="section-actions">
      <button className="secondary" disabled={busy || !clientId} onClick={refresh}><ArrowsClockwise size={18} /> {busy ? 'Refreshing…' : 'Refresh Gmail'}</button>
      {!clientId && <button className="quiet" onClick={settings}>Google setup</button>}
    </div>
    {clientId && <details><summary>Import options</summary><p className="muted">Refresh saves new inbox subjects as follow-ups. Your first refresh checks the last 7 days.</p>
      <label>Save to area<select value={area} disabled={busy} onChange={event => setArea(event.target.value)}>{areas.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label>
    </details>}
    {last && <small>Last checked {new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(last.checkedAt))}</small>}
    {message && <p role="status">{message}</p>}
  </section>;
}

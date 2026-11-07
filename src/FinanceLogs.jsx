import React, { useEffect, useState } from 'react';
import { money, prettyDate } from './model.js';
import { downloadFile } from './files.js';
import { accountTypes, decryptAccount, rowsCSV, taxYearStart, travelSummary } from './personal-model.js';

export function BankAccounts({ records, open }) {
  const accounts = records.filter(item => item.kind === 'bank_account');
  const [chosen, setChosen] = useState('');
  const [number, setNumber] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    if (!number) return;
    const hide = () => { if (document.hidden) setNumber(''); };
    const timer = window.setTimeout(() => setNumber(''), 60000);
    document.addEventListener('visibilitychange', hide);
    return () => { window.clearTimeout(timer); document.removeEventListener('visibilitychange', hide); };
  }, [number]);

  async function reveal(event, account) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setBusy(true);
    setMessage('');
    try { setNumber(await decryptAccount(account.vault, String(form.get('phrase') || ''))); }
    catch (error) { setMessage(error.message); }
    finally { formElement.reset(); setBusy(false); }
  }
  return <section className="feature-section">
    <div className="section-actions"><h2>Bank accounts</h2><button className="secondary" onClick={() => open({ kind: 'bank_account', area: 'finance' })}>Add bank account</button></div>
    <p className="muted">A private directory of account numbers. Each full number requires its vault passphrase.</p>
    {!accounts.length && <p className="muted">Add an account to start your directory.</p>}
    <ul>{accounts.map(item => <li className="account-row" key={item.id}>
      <div className="row"><button className="row-detail" onClick={() => open(item)}><span>{item.title}<small>{item.bank} · {accountTypes[item.accountType]} · •••• {item.last4}</small></span></button>
        <button className="quiet" disabled={busy} onClick={() => { setChosen(chosen === item.id ? '' : item.id); setNumber(''); setMessage(''); }}>{chosen === item.id ? 'Hide' : 'Reveal number'}</button></div>
      {chosen === item.id && (number ? <p className="account-number" role="status">{number}</p>
        : <form onSubmit={event => reveal(event, item)} className="quick-line"><label>Vault passphrase<input name="phrase" type="password" autoComplete="off" maxLength="200" required /></label>
          <button className="secondary" disabled={busy}>{busy ? 'Unlocking…' : 'Unlock'}</button></form>)}
      {chosen === item.id && message && <p role="alert">{message}</p>}
    </li>)}</ul>
  </section>;
}

const rand = value => (Number(value || 0) / 100).toFixed(2);
const dateRange = (day, setStart, setEnd, start, end) => <div className="two-fields">
  <label>From date<input type="date" value={start} max={end || day} onChange={event => setStart(event.target.value)} /></label>
  <label>To date<input type="date" value={end} min={start} onChange={event => setEnd(event.target.value)} /></label>
</div>;

export function TravelLog({ records, day, open }) {
  const [start, setStart] = useState(day.slice(0, 7) + '-01');
  const [end, setEnd] = useState(day);
  const [vehicle, setVehicle] = useState('');
  const all = records.filter(item => item.kind === 'travel');
  const vehicles = [...new Set(all.map(item => item.vehicle))].sort();
  const entries = all.filter(item => (!start || item.day >= start) && (!end || item.day <= end) && (!vehicle || item.vehicle === vehicle))
    .sort((a, b) => b.day.localeCompare(a.day));
  const summary = travelSummary(entries);
  function exportTrips() {
    downloadFile(rowsCSV([['Date', 'Vehicle', 'Type', 'Use', 'Purpose', 'From', 'Destination', 'Start odometer', 'End odometer', 'Trip km', 'Diesel litres', 'Diesel cost ZAR', 'Other cost ZAR', 'Notes'],
      ...entries.map(item => [item.day, item.vehicle, item.travelType, item.use, item.title, item.from, item.destination, item.odometerStart,
        item.odometerEnd, item.km, item.litres, rand(item.fuel), rand(item.amount), item.detail])]), 'mjw-travel-log.csv', 'text/csv');
  }
  return <section className="feature-section">
    <div className="section-actions"><h2>Travel and diesel</h2><button className="secondary" onClick={() => open({ kind: 'travel', area: 'finance', day, vehicle })}>Log travel</button></div>
    {dateRange(day, setStart, setEnd, start, end)}
    <label>Vehicle<select value={vehicle} onChange={event => setVehicle(event.target.value)}><option value="">All vehicles</option>{vehicles.map(name => <option key={name}>{name}</option>)}</select></label>
    <dl className="stat-grid">
      <div><dt>Distance logged</dt><dd>{Number(summary.km.toFixed(2))} km</dd><small>{Number(summary.businessKm.toFixed(2))} business km</small></div>
      <div><dt>Diesel</dt><dd>{money(summary.fuel)}</dd><small>{Number(summary.litres.toFixed(2))} litres</small></div>
      <div><dt>Total travel costs</dt><dd>{money(summary.total)}</dd><small>Diesel and other costs</small></div>
      <div><dt>Cost per km</dt><dd>{summary.costPerKm === null ? 'Add trip distance' : money(summary.costPerKm)}</dd><small>Recorded costs ÷ recorded km</small></div>
    </dl>
    {entries.length ? <ul>{entries.map(item => <li className="row" key={item.id}><button className="row-detail" onClick={() => open(item)}><span>{item.title}<small>{prettyDate(item.day)} · {item.vehicle} · {item.travelType === 'trip' ? item.km + ' km' : 'Fill-up / expense'}</small></span><span>{money((item.fuel || 0) + (item.amount || 0))}</span></button></li>)}</ul>
      : <p className="muted">No entries match these dates.</p>}
    <button className="quiet" disabled={!entries.length} onClick={exportTrips}>Export travel CSV</button>
  </section>;
}

export function TaxLog({ records, day, open, downloadDocument }) {
  const [start, setStart] = useState(taxYearStart(day));
  const [end, setEnd] = useState(day);
  const [notice, setNotice] = useState('');
  const entries = records.filter(item => item.kind === 'tax_receipt' && (!start || item.day >= start) && (!end || item.day <= end))
    .sort((a, b) => b.day.localeCompare(a.day));
  function exportReceipts() {
    downloadFile(rowsCSV([['Date', 'Supplier or expense', 'Category', 'Amount ZAR', 'Use', 'Reference', 'Review status', 'Receipt file', 'Notes'],
      ...entries.map(item => [item.day, item.title, item.category, rand(item.amount), item.use, item.reference, item.reviewStatus,
        item.filename || '', item.detail])]), 'mjw-sars-expense-log.csv', 'text/csv');
  }
  return <section className="feature-section">
    <div className="section-actions"><h2>SARS expense records</h2><button className="secondary" onClick={() => open({ kind: 'tax_receipt', area: 'finance', day })}>Log receipt</button></div>
    <p className="muted">Keep receipts and expenses together for tax review. Download receipt files separately from the CSV.</p>
    {dateRange(day, setStart, setEnd, start, end)}
    <p>{money(entries.reduce((sum, item) => sum + item.amount, 0))} logged · {entries.length} {entries.length === 1 ? 'entry' : 'entries'}</p>
    <ul>{entries.map(item => <li className="row family-row" key={item.id}><button className="row-detail" onClick={() => open(item)}>
      <span>{item.title}<small>{prettyDate(item.day)} · {item.category} · {item.reviewStatus === 'reviewed' ? 'Reviewed' : 'To review'}</small></span><span>{money(item.amount)}</span></button>
      {item.path && <button className="quiet" onClick={async () => { setNotice(''); if (!await downloadDocument(item)) setNotice('Could not download this receipt.'); }}>Receipt</button>}</li>)}</ul>
    {notice && <p role="alert">{notice}</p>}
    <button className="quiet" disabled={!entries.length} onClick={exportReceipts}>Export expense CSV</button>
  </section>;
}

import React, { useState } from 'react';
import { money, prettyDate } from './model.js';
import { billOccurrences, monthShift, outstandingBills } from './planning.js';
import { downloadFile, spendingCSV } from './files.js';

export function Budget({ records, day, open, save, importRecords, renderRow, busy }) {
  const [month, setMonth] = useState(day.slice(0, 7));
  const [purchase, setPurchase] = useState('');
  const [payment, setPayment] = useState(null);
  const [preview, setPreview] = useState([]);
  const [notice, setNotice] = useState('');
  const [importing, setImporting] = useState(false);
  const balance = records.find(item => item.id === 'balance');
  const currentBills = billOccurrences(records, month);
  const actual = records.filter(item => (item.kind === 'expense' || item.kind === 'bill_payment') && item.day?.startsWith(month));
  const targets = records.filter(item => item.kind === 'budget' && item.month === month);
  const spending = actual.reduce((sum, item) => sum + item.amount, 0);
  const totalTarget = targets.reduce((sum, item) => sum + item.amount, 0);
  const unpaid = outstandingBills(records, day);
  const upcoming = unpaid.reduce((sum, item) => sum + item.bill.amount, 0);
  const oldest = unpaid.find(item => item.due.slice(0, 7) < day.slice(0, 7));
  const left = balance ? balance.amount - upcoming : null;

  async function recordPayment(event) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    if (await save({ id: payment.paymentId, kind: 'bill_payment', area: 'finance', relatedId: payment.bill.id, title: payment.bill.title,
      category: payment.bill.category, due: payment.due, day: data.get('day'), amount: Math.round(Number(data.get('amount')) * 100) })) setPayment(null);
  }

  async function readStatement(event) {
    setPreview([]);
    setNotice('');
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    if (file.size > 256000) { setNotice('Choose a CSV smaller than 250 KB.'); return; }
    try {
      const entries = await spendingCSV(await file.text());
      const ids = new Set(records.map(item => item.id));
      setPreview(entries.filter(item => !ids.has(item.id)));
      if (entries.every(item => ids.has(item.id))) setNotice('These rows are already in your budget.');
    } catch (error) { setNotice(error.message); }
  }

  async function saveStatement() {
    setImporting(true);
    try {
      if (await importRecords(preview)) {
        setNotice(preview.length + ' spending entries imported.');
        setPreview([]);
      } else setNotice('Could not import this statement. Try again.');
    } finally { setImporting(false); }
  }

  return <section className="feature-section">
    <div className="section-actions"><h2>Budget</h2><button className="quiet" onClick={() => open({ kind: 'expense', area: 'finance', day })}>Log spending</button></div>
    <dl className="stat-grid">
      <div><dt>Bank balance</dt><dd>{balance ? money(balance.amount) : 'Add balance'}</dd>{balance && <small>{prettyDate(balance.day)}</small>}</div>
      <div><dt>Unpaid bills</dt><dd>{money(upcoming)}</dd><small>Overdue bills and bills due within 30 days</small></div>
      <div><dt>Left after bills</dt><dd className={left < 0 ? 'warning' : ''}>{left === null ? 'Set balance' : money(left)}</dd><small>Based on the balance and bills you entered</small></div>
    </dl>
    <div className="section-actions"><button className="secondary" onClick={() => open(balance || { id: 'balance', kind: 'balance' })}>Update balance</button><button className="secondary" onClick={() => open({ kind: 'bill', area: 'finance' })}>Add bill</button></div>
    {oldest && <button className="quiet" onClick={() => { setMonth(oldest.due.slice(0, 7)); setPayment(null); }}>Review unpaid bills from {oldest.due.slice(0, 7)}</button>}
    {left !== null && <details><summary>Check a purchase</summary><label>Purchase amount (R)<input value={purchase} min="0" step=".01" max="1000000000" type="number" onChange={event => setPurchase(event.target.value)} /></label>
      {purchase !== '' && Number(purchase) >= 0 && <p>{money(left - Math.round(Number(purchase) * 100))} left after this purchase</p>}</details>}
    <div className="section-actions section-heading"><h3>Monthly plan</h3><label>Budget month<input type="month" value={month} onChange={event => { if (/^\d{4}-\d{2}$/.test(event.target.value)) { setMonth(event.target.value); setPayment(null); } }} /></label></div>
    <div className="section-actions"><button className="quiet" onClick={() => { setMonth(monthShift(month, -1)); setPayment(null); }}>Previous month</button><button className="quiet" onClick={() => { setMonth(monthShift(month, 1)); setPayment(null); }}>Next month</button></div>
    <p>{money(spending)} recorded spending{targets.length > 0 && ' / ' + money(totalTarget) + ' budgeted'}</p>
    <small>Mark a bill paid or log a purchase once. Recorded spending includes both.</small>
    <ul>{targets.map(item => {
      const spent = actual.filter(entry => entry.category?.trim().toLowerCase() === item.title.trim().toLowerCase()).reduce((sum, entry) => sum + entry.amount, 0);
      return <li key={item.id} className="row"><button className="row-detail" onClick={() => open(item)}><span>{item.title}<small>{money(spent)} spent of {money(item.amount)}</small></span><span className={spent > item.amount ? 'warning' : 'muted'}>{money(item.amount - spent)} left</span></button></li>;
    })}</ul>
    <button className="secondary" onClick={() => open({ kind: 'budget', month, area: 'finance' })}>Set category budget</button>
    <h3 className="section-heading">Bills</h3>
    {currentBills.length === 0 && <p className="muted">No bills for this month.</p>}
    <ul>{currentBills.map(item => <li className="row" key={item.paymentId}>
      <button className="row-detail" onClick={() => open(item.bill)}><span>{item.bill.title}<small>{prettyDate(item.due)} · {money(item.bill.amount)}{item.bill.repeat ? ' · Monthly' : ''}</small></span></button>
      {item.paid ? <span className="bill-paid">Paid <button className="quiet" disabled={busy} onClick={() => item.payment ? save(item.payment, true) : save({ ...item.bill, paid: false })}>Undo</button></span>
        : <button className="quiet" onClick={() => setPayment(item)}>Mark paid</button>}
    </li>)}</ul>
    {payment && <form onSubmit={recordPayment} key={payment.paymentId}>
      <h3>Record payment for {payment.bill.title}</h3>
      <label>Paid on<input type="date" name="day" defaultValue={day} required /></label>
      <label>Amount paid (R)<input name="amount" type="number" step=".01" min="0" max="1000000000" defaultValue={payment.bill.amount / 100} required /></label>
      <div className="section-actions"><button className="secondary" disabled={busy}>Save payment</button><button className="quiet" type="button" onClick={() => setPayment(null)}>Cancel</button></div>
    </form>}
    <h3 className="section-heading">Spending entries</h3>
    <ul>{actual.filter(item => item.kind === 'expense').sort((a, b) => b.day.localeCompare(a.day)).map(renderRow)}</ul>
    <details><summary>Import a spending CSV</summary>
      <p className="muted">Use the template columns and positive rand amounts for expenses. Review the rows before saving.</p>
      <button className="quiet" onClick={() => downloadFile('date,description,category,amount\n', 'mjw-spending-template.csv', 'text/csv')}>Download template</button>
      <label>Choose CSV<input type="file" accept=".csv,text/csv" disabled={importing} onChange={readStatement} /></label>
      {preview.length > 0 && <><ul>{preview.map(item => <li key={item.id} className="row">{item.day} · {item.title} · {money(item.amount)}</li>)}</ul>
        <button className="secondary" disabled={importing || busy} onClick={saveStatement}>Import {preview.length} entries</button></>}
      {notice && <p role="status">{notice}</p>}
    </details>
  </section>;
}

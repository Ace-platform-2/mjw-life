import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarDots, CheckCircle, Funnel, WarningCircle } from '@phosphor-icons/react';
import { money, prettyDate, shiftDay } from './model.js';
import { buildingSnapshot, controlSummary, datedActivity } from './action-control.js';

const order = ['all', 'fpg', 'personal'];
const groups = { all: 'All areas', fpg: 'FPG', personal: 'Personal' };
const labelDate = value => value ? prettyDate(value) : '';
const human = value => String(value || '').trim();

export function ActionControl({ records, day, open, back, openInbox, openProperties }) {
  const [since, setSince] = useState(() => shiftDay(day, -7));
  const [scope, setScope] = useState('fpg');
  const [buildingId, setBuildingId] = useState('');
  const [view, setView] = useState('attention');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(12);
  const buildings = useMemo(() => records.filter(row => row.kind === 'fpg_building')
    .sort((a,b) => a.title.localeCompare(b.title)), [records]);
  const byId = useMemo(() => new Map(buildings.map(item => [item.id, item])), [buildings]);
  const options = { scope, buildingId: scope === 'fpg' ? buildingId : '' };
  const summary = controlSummary(records, day, options);
  const activity = datedActivity(records, since, day, { scope }).filter(item => !buildingId ||
    scope !== 'fpg' || item.buildingId === buildingId);
  const searchable = list => list.filter(row => {
    const item = row.item || row;
    const haystack = [item.title, item.detail, item.tenantName, item.owner, item.nextAction, item.reference,
      byId.get(item.buildingId)?.title].join(' ').toLocaleLowerCase();
    return haystack.includes(query.trim().toLocaleLowerCase());
  });
  const entries = searchable(view === 'all' ? summary.all : summary.attention);
  const sortedEntries = [...entries].sort((a,b) => b.score - a.score || (a.item.title || '').localeCompare(b.item.title || ''));
  const activeBudgets = summary.all.filter(x => x.budget).sort((a,b) =>
    Number(b.overdueDays > 0) - Number(a.overdueDays > 0) || (a.due || '9999').localeCompare(b.due || '9999'));
  const portfolio = scope === 'fpg' && !buildingId ? buildings.map(building => ({
    building, stats: buildingSnapshot(records, building.id, day),
  })).filter(row => row.stats.open || row.stats.arrearsCases || row.stats.vacancies) : [];
  const itemMeta = row => {
    const item = row.item;
    return [
      row.isProperty ? byId.get(item.buildingId)?.title || 'Property not linked' : 'Task',
      item.tenantName,
      row.owner && 'Owner: ' + row.owner,
      row.due && 'Due: ' + labelDate(row.due),
    ].filter(Boolean).join(' · ');
  };
  function changeScope(value) { setScope(value); setBuildingId(''); setLimit(12); }
  return <div className="screen inside control-screen">
    <button className="quiet property-back" onClick={back}><ArrowLeft size={17} /> Today</button>
    <div className="page-heading"><div><small>Action control</small><h1>Catch-up</h1></div>
      <button className="secondary" onClick={openInbox}>Review Inbox <ArrowRight size={16}/></button></div>
    <p className="muted">Live view of records saved in MJW Life. No automatic Gmail, calendar, MRI or MDA reconciliation is claimed. Open an entry to update its status, owner, next action and follow-up.</p>
    <div className="two-fields">
      <label>Workspace<select value={scope} onChange={event => changeScope(event.target.value)}>
        {order.map(key => <option key={key} value={key}>{groups[key]}</option>)}
      </select></label>
      <label>Activity dated since<input type="date" value={since} max={day} onChange={event => setSince(event.target.value || shiftDay(day, -7))}/></label>
    </div>
    {scope === 'fpg' && buildings.length > 0 && <label>Property<select value={buildingId} onChange={event => { setBuildingId(event.target.value); setLimit(12); }}>
      <option value="">Entire portfolio</option>{buildings.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}
    </select></label>}
    <dl className="stat-grid control-stats">
      <div><dt>Open items</dt><dd>{summary.open}</dd></div>
      <div><dt>Urgent</dt><dd>{summary.urgent}</dd></div>
      <div><dt>Overdue</dt><dd>{summary.overdue}</dd></div>
      <div><dt>Waiting</dt><dd>{summary.waiting}</dd></div>
      {scope !== 'personal' && <><div><dt>Open budgets</dt><dd>{summary.budgets}</dd></div>
      <div><dt>Missing owners</dt><dd>{summary.missingOwner}</dd></div></>}
    </dl>
    <section className="feature-section">
      <div className="section-actions">
        <h2><WarningCircle size={22} /> Action register</h2>
        <button className="quiet" onClick={() => {setView(view === 'attention' ? 'all' : 'attention');setLimit(12);}}>
          <Funnel size={16} /> {view === 'attention' ? 'Show all open' : 'Show attention only'}
        </button>
      </div>
      <label>Find work<input type="search" placeholder="Title, property, tenant, owner or reference" value={query}
        onChange={event => { setQuery(event.target.value); setLimit(12); }}/></label>
      <p className="muted">{sortedEntries.length} matching {view === 'attention' ? 'priority' : 'open'} items</p>
      {!sortedEntries.length && <p className="muted">No matching saved records. Check the filters and your source data.</p>}
      <ul className="control-list">{sortedEntries.slice(0,limit).map(row => <li key={row.id}>
        <button className="row-detail control-row" onClick={() => open(row.item)}>
          <span className="control-copy"><strong>{row.item.title || 'Untitled record'}</strong><small>{itemMeta(row)}</small>
            {row.nextAction && <small>Next: {row.nextAction}</small>}
            {row.reasons.length > 0 && <small className="control-flags">{row.reasons.join(' · ')}</small>}
          </span><ArrowRight size={18}/></button>
      </li>)}</ul>
      {sortedEntries.length > limit && <button className="quiet" onClick={() => setLimit(limit + 12)}>Show more ({sortedEntries.length - limit} remaining)</button>}
    </section>
    {scope !== 'personal' && <section className="feature-section">
      <div className="section-actions"><h2>Budget control</h2><button className="quiet" onClick={openProperties}>Open properties</button></div>
      {activeBudgets.length === 0 ? <p className="muted">No open budget entries saved in this scope.</p>
        : <ul className="control-list">{activeBudgets.map(row => <li key={row.id}>
          <button className="row-detail control-row" onClick={() => open(row.item)}>
            <span><strong>{byId.get(row.item.buildingId)?.title || 'Unlinked building'} · {row.item.title}</strong>
              <small>{row.item.status || 'Open'}{row.due ? ' · Due ' + labelDate(row.due) : ' · Follow-up date not entered'}
                {row.owner ? ' · ' + row.owner : ' · Owner not assigned'}</small>
              {row.nextAction && <small>Next: {row.nextAction}</small>}
            </span><ArrowRight size={18}/></button></li>)}</ul>}
    </section>}
    {portfolio.length > 0 && <section className="feature-section">
      <h2>Portfolio exceptions</h2>
      <p className="muted">Values below are only recorded balances, not an MRI debtor reconciliation.</p>
      <ul className="control-list">{portfolio.map(({ building, stats }) => <li key={building.id}>
        <button className="row-detail control-row" onClick={() => { setBuildingId(building.id); setView('all'); setLimit(12); window.scrollTo(0,0); }}>
          <span><strong>{building.title}</strong>
            <small>{stats.open} open · {stats.urgent} urgent · {stats.budgets} budgets · {stats.vacancies} vacancies</small>
            <small>{stats.arrearsCases} arrears cases{stats.arrearsCases ? ' · Recorded ' + money(stats.knownArrearsCents) : ''}
              {stats.arrearsBalanceMissing ? ' · ' + stats.arrearsBalanceMissing + ' balance(s) missing' : ''}</small>
          </span><ArrowRight size={18}/></button>
      </li>)}</ul>
    </section>}
    <section className="feature-section">
      <div className="section-actions"><h2><CalendarDots size={21} /> Dated activity</h2><small>{activity.length} records</small></div>
      <p className="muted">Items dated {labelDate(since)} to {labelDate(day)}. These are locally recorded dates, not proof that an email or event arrived during leave.</p>
      {activity.length === 0 ? <p className="muted">No matching dated activity in this period.</p> :
        <ul className="control-list">{searchable(activity).slice(0,20).map(item => <li key={item.id}>
          <button className="row-detail control-row" onClick={() => open(item)}>
            <span><strong>{item.title || 'Untitled record'}</strong><small>{byId.get(item.buildingId)?.title || item.area || item.kind} · {item.day || item.receivedOn || item.planned || item.createdAt?.slice(0,10) || item.importedAt?.slice(0,10)}</small></span>
            <ArrowRight size={18}/></button></li>)}</ul>}
    </section>
    <section className="feature-section">
      <h2><CheckCircle size={21} /> End-of-day check</h2>
      <p>Confirm the priority, update the action owner and next step on open matters, and move completed items to closed. Missing information is shown rather than assumed.</p>
      <button className="secondary" onClick={back}>Return to Today</button>
    </section>
  </div>;
}

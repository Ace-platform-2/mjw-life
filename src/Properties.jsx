import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Buildings, Camera, MagnifyingGlass, Phone, Plus, Warning, Wrench } from '@phosphor-icons/react';
import { money, prettyDate } from './model.js';
import { localTime } from './planning.js';
import { buildingMatches, isPropertyEntry, leasingStages, matchingPropertyPhone, propertyAttention, propertyPhone, propertyStatuses, propertyTypes, sitePhoneFields, tenantMatches } from './property.js';

function CallLink({ value, label }) {
  const href = propertyPhone(value);
  return href && <a className="quiet property-call" href={href} aria-label={label || ('Call ' + value)}><Phone size={17} /> {label ? 'Call' : value}</a>;
}

function Directory({ buildings, tenants, building, selectBuilding, selectTenant, open }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(12);
  const search = query.trim();
  const matches = tenants.filter(row => (!building || row.buildingId === building.id) && tenantMatches(row, buildings.get(row.buildingId), search));
  const matchingBuildings = building ? [] : [...buildings.values()].filter(row => buildingMatches(row, search));
  const showTenants = Boolean(building || search);
  return <section aria-label="Property directory">
    <label className="property-search"><span><MagnifyingGlass size={18} /> Find a contact</span>
      <input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(12); }}
        placeholder="Tenant, shop, person or phone number" />
    </label>
    {matchingBuildings.length > 0 && <ul className="property-grid">{matchingBuildings.map(row => {
      const count = tenants.filter(tenant => tenant.buildingId === row.id).length;
      return <li key={row.id}><button className="property-building" onClick={() => selectBuilding(row.id)}>
        <span className="property-code">{row.code || <Buildings size={19} />}</span><span><strong>{row.title}</strong><small>{count} tenant {count === 1 ? 'file' : 'files'}</small></span><ArrowRight size={17} />
      </button></li>;
    })}</ul>}
    {!building && !search && !matchingBuildings.length && <p className="muted">Add a property to start its contact directory and work log.</p>}
    {showTenants && <section className="feature-section property-tenant-list">
      <div className="section-actions"><h2>{search ? 'Matching tenants' : 'Tenant files'}</h2>
        <span className="muted" role="status">{matches.length} {matches.length === 1 ? 'tenant' : 'tenants'}</span>
        {building && <button className="quiet" onClick={() => open({ kind: 'fpg_tenant', buildingId: building.id })}>Add tenant</button>}</div>
      {matches.length === 0 ? <p className="muted">{search ? 'No tenants match your search.' : 'This property has no tenant files yet.'}</p>
        : <ul>{matches.slice(0, limit).map(row => {
          const phone = matchingPropertyPhone(row.phones || [], search) || row.phones?.[0];
          return <li className="row property-tenant" key={row.id}>
            <button className="row-detail" onClick={() => selectTenant(row.id)}><span>{row.title}<small>{[
              !building && buildings.get(row.buildingId)?.title, row.units?.join(', '), row.contacts?.[0],
              phone || 'No phone on file',
            ].filter(Boolean).join(' · ')}</small></span></button>
            {phone && <CallLink value={phone} label={'Call ' + row.title + ' on ' + phone} />}
          </li>;
        })}</ul>}
      {matches.length > limit && <button className="quiet" onClick={() => setLimit(limit + 12)}>Show more tenants</button>}
    </section>}
  </section>;
}

function WorkRows({ entries, buildings, tenantNames, day, open, scoped }) {
  if (!entries.length) return <p className="muted">No entries here yet.</p>;
  return <ul>{entries.map(item => {
    const overdue = item.status !== 'closed' && item.due && item.due < day;
    const escalated = item.status !== 'closed' && item.escalated;
    return <li className="row property-log-row" key={item.id}>
      <button className="row-detail" onClick={() => open(item)}>
        <span>{item.title}<small>{[
          propertyTypes[item.propertyType], !scoped && buildings.get(item.buildingId)?.title, tenantNames.get(item.tenantId),
          item.day && prettyDate(item.day), item.startsAt ? localTime(item.startsAt) : item.time, propertyStatuses[item.status],
        ].filter(Boolean).join(' · ')}</small>
        {(item.due || item.owner || item.nextAction) && <small>{[
          item.owner, item.due && 'Follow-up ' + prettyDate(item.due), item.nextAction,
        ].filter(Boolean).join(' · ')}</small>}
        {(escalated || overdue) && <small className="property-escalated">{[escalated && 'Escalation', overdue && 'Overdue'].filter(Boolean).join(' · ')}</small>}
        </span>
        <span className="property-log-value">{item.propertyType === 'arrears' ? money(item.amount)
          : item.propertyType === 'leasing' ? leasingStages[item.stage]
          : item.floorArea ? item.floorArea + ' m²' : item.photos?.length ? <><Camera size={16} /> {item.photos.length}</> : <ArrowRight size={17} />}</span>
      </button>
    </li>;
  })}</ul>;
}

function WorkLog({ entries, buildings, tenantNames, building, day, open, createEntry, filter, setFilter }) {
  const { type, status } = filter;
  const [limit, setLimit] = useState(20);
  const scope = entries.filter(row => (!building || row.buildingId === building.id) && (!type || row.propertyType === type));
  const attention = propertyAttention(scope, day);
  const shown = status === 'attention' ? attention : scope.filter(row =>
    status === 'all' || (status === 'closed' ? row.status === 'closed' : row.status !== 'closed'));
  if (type === 'meeting' && status === 'open') shown.sort((a, b) => (a.startsAt || '').localeCompare(b.startsAt || ''));
  return <section aria-label="Property work log">
    <div className="section-actions"><h2>Work log</h2><button className="quiet" onClick={() => createEntry(type || 'maintenance')}>Add entry</button></div>
    <div className="two-fields property-log-filters">
      <label>Entry type<select value={type} onChange={event => { setFilter({ ...filter, type: event.target.value }); setLimit(20); }}>
        <option value="">All types</option>{Object.entries(propertyTypes).map(([id, title]) => <option value={id} key={id}>{title}</option>)}
      </select></label>
      <label>Status<select value={status} onChange={event => { setFilter({ ...filter, status: event.target.value }); setLimit(20); }}>
        <option value="open">Open work</option><option value="attention">Needs attention ({attention.length})</option><option value="closed">Closed</option><option value="all">All entries</option>
      </select></label>
    </div>
    <WorkRows entries={shown.slice(0, limit)} buildings={buildings} tenantNames={tenantNames} day={day} open={open} scoped={building} />
    {shown.length > limit && <button className="quiet" onClick={() => setLimit(limit + 20)}>Show more entries</button>}
  </section>;
}

function TenantFile({ tenant, building, entries, buildings, tenantNames, day, open, back, createEntry }) {
  return <section className="tenant-file">
    <button className="quiet property-back" onClick={back}><ArrowLeft size={16} /> Back to contacts</button>
    <div className="page-heading"><div><small>{building?.title} {tenant.units?.length ? '· ' + tenant.units.join(', ') : ''}</small><h1>{tenant.title}</h1></div>
      <button className="secondary" onClick={() => open(tenant)}>Edit tenant</button></div>
    {tenant.aliases?.length > 0 && <p className="muted">Also listed as {tenant.aliases.join(', ')}</p>}
    <section className="property-panel">
      <h2>Contact details</h2>
      {tenant.contacts?.length > 0 && <p>{tenant.contacts.join(' · ')}</p>}
      <ul>{tenant.phones?.map((phone, index) => <li key={index}><CallLink value={phone} /></li>)}</ul>
      {!tenant.phones?.length && <p className="muted">No phone on file.</p>}
      <ul>{tenant.emails?.map((email, index) => <li key={index}><a className="quiet property-email" href={'mailto:' + encodeURIComponent(email).replace('%40', '@')}>{email}</a></li>)}</ul>
      {tenant.detail && <p className="property-note">{tenant.detail}</p>}
      {tenant.sourceDay && <small>Contact list · {prettyDate(tenant.sourceDay)} · Page {tenant.sourcePage}</small>}
    </section>
    <section className="feature-section">
      <div className="section-actions"><h2>Tenant history</h2><button className="primary" onClick={() => createEntry('concern')}>Log for tenant</button></div>
      <WorkRows entries={entries.filter(row => row.tenantId === tenant.id)} buildings={buildings} tenantNames={tenantNames} day={day} open={open} scoped />
    </section>
  </section>;
}

export function Properties({ records, day, open, back }) {
  const [buildingId, setBuildingId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [tab, setTab] = useState('directory');
  const [workFilter, setWorkFilter] = useState({ type: '', status: 'open' });
  const { buildings, tenants, tenantNames, entries } = useMemo(() => {
    const buildings = new Map(records.filter(row => row.kind === 'fpg_building').sort((a, b) => a.title.localeCompare(b.title)).map(row => [row.id, row]));
    const tenants = records.filter(row => row.kind === 'fpg_tenant').sort((a, b) => a.title.localeCompare(b.title));
    const tenantNames = new Map(tenants.map(row => [row.id, row.title]));
    const entries = records.filter(isPropertyEntry).sort((a, b) =>
      (b.day || '').localeCompare(a.day || '') ||
      (b.startsAt || b.time || '').localeCompare(a.startsAt || a.time || '') ||
      (b.createdAt || '').localeCompare(a.createdAt || ''));
    return { buildings, tenants, tenantNames, entries };
  }, [records]);
  const building = buildings.get(buildingId);
  const tenant = tenants.find(row => row.id === tenantId);
  const buildingNumbers = building ? Object.entries(sitePhoneFields).filter(([name]) => propertyPhone(building[name])) : [];

  function selectBuilding(id) {
    setBuildingId(id);
    setTenantId('');
    setTab('directory');
    setWorkFilter({ type: '', status: 'open' });
    window.scrollTo(0, 0);
  }

  function createEntry(type) {
    if (!tenant) {
      setTab('work');
      setWorkFilter({ type: '', status: 'all' });
    }
    open({ kind: 'fpg_log', propertyType: type, buildingId: tenant?.buildingId || buildingId, tenantId: tenant?.id });
  }

  return <div className="screen property-page">
    <div hidden={Boolean(tenant)}>
      <button className="quiet property-back" onClick={building ? () => selectBuilding('') : back}><ArrowLeft size={16} /> {building ? 'All properties' : 'Back to FPG'}</button>
      <div className="page-heading"><div><small>FPG · Property management</small><h1>{building?.title || 'Properties'}</h1></div>
        <button className="secondary" onClick={() => open(building || { kind: 'fpg_building' })}>{building ? 'Edit property' : 'Add property'}</button></div>
      {building && (building.address || building.erf) && <p className="muted">{[building.address, building.erf && 'Erf ' + building.erf].filter(Boolean).join(' · ')}</p>}
      {building && <section className="property-panel">
        <h2>Site numbers</h2>
        {buildingNumbers.length ? <ul>{buildingNumbers.map(([name, label]) =>
          <li key={name} className="row"><span>{label}</span><CallLink value={building[name]} /></li>)}</ul>
          : <p className="muted">No control room, facilities or site office numbers on file. Add them under Edit property.</p>}
      </section>}
      {buildings.size > 0 && <div className="property-capture" aria-label="Quick property capture">
        <button className="property-incident" onClick={() => createEntry('incident')}><Warning size={21} /> Log incident</button>
        <button onClick={() => createEntry('maintenance')}><Wrench size={21} /> Maintenance</button>
        <button onClick={() => createEntry('site_report')}><Camera size={21} /> Site report</button>
        <button onClick={() => createEntry('concern')}><Plus size={21} /> Tenant concern</button>
      </div>}
      <div className="segmented record-tabs property-tabs" aria-label="Property view">
        <button aria-pressed={tab === 'directory'} onClick={() => setTab('directory')}>Directory</button>
        <button aria-pressed={tab === 'work'} onClick={() => setTab('work')}>Work log</button>
      </div>
      {tab === 'directory' ? <Directory key={buildingId} buildings={buildings} tenants={tenants} building={building} selectBuilding={selectBuilding}
        selectTenant={id => { setTenantId(id); window.scrollTo(0, 0); }} open={open} />
        : <WorkLog key={buildingId} entries={entries} buildings={buildings} tenantNames={tenantNames} building={building}
          day={day} open={open} createEntry={createEntry} filter={workFilter} setFilter={setWorkFilter} />}
    </div>
    {tenant && <TenantFile tenant={tenant} building={buildings.get(tenant.buildingId)} entries={entries} buildings={buildings} tenantNames={tenantNames}
      day={day} open={open} createEntry={createEntry} back={() => { setTenantId(''); window.scrollTo(0, 0); }} />}
  </div>;
}

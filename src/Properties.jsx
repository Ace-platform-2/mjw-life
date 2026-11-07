import React, { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Buildings, Camera, DownloadSimple, MagnifyingGlass, Phone, Plus, Warning, Wrench } from '@phosphor-icons/react';
import { BuildingDocuments } from './BuildingDocuments.jsx';
import { downloadFile } from './files.js';
import { buildingSnapshot, controlSummary } from './action-control.js';
import { money, prettyDate } from './model.js';
import { localTime } from './planning.js';
import { budgetStages, buildingMatches, fpgNumberCategories, fpgNumberMatches, isPropertyEntry, leasingStages, matchingPropertyPhone, propertyAttention, propertyPhone, propertyStatuses, propertyTypes, propertyWorkMatches, sitePhoneFields, tenantMatches, vacancyStages } from './property.js';

function CallLink({ value, label }) {
  const href = propertyPhone(value);
  return href && <a className="quiet property-call" href={href} aria-label={label || ('Call ' + value)}><Phone size={17} /> {label ? 'Call' : value}</a>;
}

function Directory({ buildings, tenants, building, day, selectBuilding, selectTenant, open }) {
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(12);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const search = query.trim();
  const scopedTenants = tenants.filter(row => building ? row.buildingId === building.id : buildings.has(row.buildingId));
  const matches = scopedTenants.filter(row => tenantMatches(row, buildings.get(row.buildingId), search));
  const matchingBuildings = building ? [] : [...buildings.values()].filter(row => buildingMatches(row, search));
  const showTenants = Boolean(building || search);

  async function exportDirectory() {
    setExporting(true);
    setExportError('');
    try {
      const { tenantDirectoryPdf } = await import('./tenant-pdf.js');
      const pdf = await tenantDirectoryPdf(building ? [building] : [...buildings.values()], scopedTenants, day).getBlob();
      const code = (building?.code || building?.title || 'portfolio').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'property';
      downloadFile(pdf, 'fpg-tenant-directory-' + code + '.pdf', 'application/pdf');
    } catch {
      setExportError('Could not create the tenant PDF. Try again.');
    } finally {
      setExporting(false);
    }
  }

  return <section aria-label="Property directory">
    {(scopedTenants.length > 0 || building) && <div className="section-actions property-directory-actions">
      {scopedTenants.length > 0 && <button className="secondary property-file-download" disabled={exporting} onClick={exportDirectory}>
        <DownloadSimple size={17} /> {exporting ? 'Preparing PDF…' : building ? 'Tenant list · A4 PDF' : 'All tenants · A4 PDF'}
      </button>}
      {building && <button className="quiet" onClick={() => open({ kind: 'fpg_tenant', buildingId: building.id })}>Add tenant</button>}
    </div>}
    {exportError && <p role="alert">{exportError}</p>}
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
        <span className="muted" role="status">{matches.length} {matches.length === 1 ? 'tenant' : 'tenants'}</span></div>
      {matches.length === 0 ? <p className="muted">{search ? 'No tenants match your search.' : 'This property has no tenant files yet.'}</p>
        : <ul>{matches.slice(0, limit).map(row => {
          const phone = matchingPropertyPhone(row.phones || [], search) || row.phones?.[0];
          const details = [!building && buildings.get(row.buildingId)?.title, row.units?.join(', '), row.contacts?.[0], phone]
            .filter(Boolean).join(' · ');
          return <li className="row property-tenant" key={row.id}>
            <button className="row-detail" onClick={() => selectTenant(row.id)}><span>{row.title}{details && <small>{details}</small>}</span></button>
            {phone && <CallLink value={phone} label={'Call ' + row.title + ' on ' + phone} />}
          </li>;
        })}</ul>}
      {matches.length > limit && <button className="quiet" onClick={() => setLimit(limit + 12)}>Show more tenants</button>}
    </section>}
  </section>;
}

function FpgNumbers({ contacts, open }) {
  const [query, setQuery] = useState('');
  const matches = contacts.filter(contact => fpgNumberMatches(contact, query)).sort((a, b) => a.title.localeCompare(b.title));
  return <section className="feature-section" aria-label="FPG phonebook">
    <div className="section-actions"><h2>Important FPG numbers</h2>
      <button className="secondary" onClick={() => open({ kind: 'fpg_contact' })}>Add number</button>
    </div>
    <label className="property-search"><span><MagnifyingGlass size={18} /> Find an FPG number</span>
      <input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, company, category or number" />
    </label>
    {query.trim() && !matches.length && <p className="muted">No contacts match your search.</p>}
    <ul>{matches.map(contact => <li key={contact.id} className="property-number-row">
      <button className="row-detail" onClick={() => open(contact)}><span>{contact.title}<small>{fpgNumberCategories[contact.category]}</small></span><ArrowRight size={17} /></button>
      {[contact.phone, contact.alternatePhone].some(Boolean) && <div className="property-number-links">
        <CallLink value={contact.phone} /><CallLink value={contact.alternatePhone} />
      </div>}
    </li>)}</ul>
  </section>;
}

const registerTabs = { arrears: 'Arrears', vacancy: 'Vacancies', budget: 'Budgets' };

function WorkRows({ entries, buildings, tenantNames, day, open, scoped }) {
  if (!entries.length) return <p className="muted">No entries here yet.</p>;
  return <ul>{entries.map(item => {
    const overdue = item.status !== 'closed' && item.due && item.due < day;
    const dueToday = item.status !== 'closed' && item.due === day;
    const escalated = item.status !== 'closed' && item.escalated;
    return <li className="row property-log-row" key={item.id}>
      <button className="row-detail" onClick={() => open(item)}>
        <span>{item.title}<small>{[
          propertyTypes[item.propertyType], !scoped && buildings.get(item.buildingId)?.title,
          tenantNames.get(item.tenantId) || item.tenantName || (item.tenantId && 'Former tenant'),
          item.location, item.day && (item.propertyType === 'arrears' ? 'As at ' : '') + prettyDate(item.day),
          item.startsAt ? localTime(item.startsAt) : item.time, propertyStatuses[item.status],
          vacancyStages[item.vacancyStage], item.availableFrom && 'Available ' + prettyDate(item.availableFrom),
          item.propertyType === 'budget' && budgetStages[item.budgetStage],
          item.propertyType === 'budget' && item.budgetPeriod,
          item.propertyType === 'budget' && item.budgetVersion && 'Version ' + item.budgetVersion,
          item.propertyType === 'budget' && item.submittedOn && 'Submitted ' + prettyDate(item.submittedOn),
        ].filter(Boolean).join(' · ')}</small>
        {(item.due || item.owner || item.nextAction) && <small>{[
          item.owner, item.due && 'Follow-up ' + prettyDate(item.due), item.nextAction,
        ].filter(Boolean).join(' · ')}</small>}
        {Boolean(item.followUpNotes?.length) && <small className="property-latest-note">Latest note · {item.followUpNotes.at(-1).text}</small>}
        {(escalated || overdue || dueToday) && <small className="property-escalated">{[escalated && 'Escalation', overdue && 'Overdue', dueToday && 'Due today'].filter(Boolean).join(' · ')}</small>}
        </span>
        <span className="property-log-value">{item.propertyType === 'arrears' && Number.isFinite(item.amount) ? money(item.amount)
          : item.propertyType === 'leasing' ? leasingStages[item.stage]
          : item.floorArea ? item.floorArea + ' m²' : item.photos?.length ? <><Camera size={16} /> {item.photos.length}</> : <ArrowRight size={17} />}</span>
      </button>
    </li>;
  })}</ul>;
}

function WorkLog({ entries, buildings, tenantNames, building, day, open, createEntry, initialType, initialStatus }) {
  const [type, setType] = useState(initialType || '');
  const [status, setStatus] = useState(initialStatus);
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(20);
  const scope = entries.filter(row => (!building || row.buildingId === building.id) && (!type || row.propertyType === type));
  const attention = propertyAttention(scope, day);
  const matchingStatus = status === 'attention' ? attention : scope.filter(row =>
    status === 'all' || (status === 'closed' ? row.status === 'closed' : row.status !== 'closed'));
  const shown = matchingStatus.filter(row => propertyWorkMatches(row, buildings.get(row.buildingId), tenantNames.get(row.tenantId), query));
  if (type === 'meeting' && status === 'open') shown.sort((a, b) => (a.startsAt || '').localeCompare(b.startsAt || ''));
  const title = registerTabs[initialType] || 'Work log';
  const addLabel = { arrears: 'Add arrears case', vacancy: 'Add vacancy', budget: 'Add budget item' }[initialType] || 'Add entry';
  return <section className="feature-section" aria-label={title}>
    <div className="section-actions"><h2>{title}</h2><button className="secondary" disabled={!buildings.size}
      onClick={() => createEntry(type || 'maintenance', Boolean(initialType))}>{addLabel}</button></div>
    <label className="property-search"><span><MagnifyingGlass size={18} /> Search {title.toLowerCase()}</span>
      <input type="search" value={query} onChange={event => { setQuery(event.target.value); setLimit(20); }}
        placeholder="Tenant, unit, owner, reference or note" />
    </label>
    <div className="two-fields property-log-filters">
      {!initialType && <label>Entry type<select value={type} onChange={event => { setType(event.target.value); setLimit(20); }}>
        <option value="">All types</option>{Object.entries(propertyTypes).map(([id, title]) => <option value={id} key={id}>{title}</option>)}
      </select></label>}
      <label>Status<select value={status} onChange={event => { setStatus(event.target.value); setLimit(20); }}>
        <option value="open">Open work</option><option value="attention">Needs attention ({attention.length})</option><option value="closed">Closed</option><option value="all">All entries</option>
      </select></label>
    </div>
    <p className="muted" role="status">{shown.length} {shown.length === 1 ? 'entry' : 'entries'}</p>
    <WorkRows entries={shown.slice(0, limit)} buildings={buildings} tenantNames={tenantNames} day={day} open={open} scoped={building} />
    {shown.length > limit && <button className="quiet" onClick={() => setLimit(limit + 20)}>Show more entries</button>}
  </section>;
}

function TenantFile({ tenant, building, entries, buildings, tenantNames, day, open, back, createEntry }) {
  const hasContactDetails = tenant.contacts?.length || tenant.phones?.length || tenant.emails?.length || tenant.detail;
  return <section className="tenant-file">
    <button className="quiet property-back" onClick={back}><ArrowLeft size={16} /> Back to contacts</button>
    <div className="page-heading"><div><small>{building?.title} {tenant.units?.length ? '· ' + tenant.units.join(', ') : ''}</small><h1>{tenant.title}</h1></div>
      <button className="secondary" onClick={() => open(tenant)}>Edit tenant</button></div>
    {tenant.aliases?.length > 0 && <p className="muted">Also listed as {tenant.aliases.join(', ')}</p>}
    {Boolean(hasContactDetails) && <section className="property-panel">
      <h2>Contact details</h2>
      {tenant.contacts?.length > 0 && <p>{tenant.contacts.join(' · ')}</p>}
      <ul>{tenant.phones?.map((phone, index) => <li key={index}><CallLink value={phone} /></li>)}</ul>
      <ul>{tenant.emails?.map((email, index) => <li key={index}><a className="quiet property-email" href={'mailto:' + encodeURIComponent(email).replace('%40', '@')}>{email}</a></li>)}</ul>
      {tenant.detail && <p className="property-note">{tenant.detail}</p>}
    </section>}
    <section className="feature-section">
      <div className="section-actions"><h2>Tenant history</h2><div className="section-actions">
        <button className="secondary" onClick={() => createEntry('arrears', true)}>Add arrears case</button>
        <button className="primary" onClick={() => createEntry('concern')}>Log for tenant</button>
      </div></div>
      <WorkRows entries={entries.filter(row => row.tenantId === tenant.id)} buildings={buildings} tenantNames={tenantNames} day={day} open={open} />
    </section>
  </section>;
}

export function Properties({ records, day, open, back, downloadDocument, initialTab = 'directory', initialStatus = 'open' }) {
  const [buildingId, setBuildingId] = useState('');
  const [tenantId, setTenantId] = useState('');
  const [tab, setTab] = useState(initialTab);
  const [defaultWorkStatus, setDefaultWorkStatus] = useState(initialStatus);
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
  const control = building ? buildingSnapshot(entries, building.id, day)
    : controlSummary(entries, day, { scope: 'fpg' });

  function selectBuilding(id) {
    setBuildingId(id);
    setTenantId('');
    setTab('directory');
    setDefaultWorkStatus('open');
    window.scrollTo(0, 0);
  }

  function createEntry(type, fixedType = false, fromQuickCapture = false) {
    if (fromQuickCapture) {
      setDefaultWorkStatus('all');
      setTab('work');
    }
    open({ kind: 'fpg_log', propertyType: type, buildingId: tenant?.buildingId || buildingId,
      tenantId: tenant?.id, title: type === 'arrears' && tenant ? tenant.title : '', fixedType });
  }

  return <div className="screen property-page">
    <div hidden={Boolean(tenant)}>
      <button className="quiet property-back" onClick={building ? () => selectBuilding('') : back}><ArrowLeft size={16} /> {building ? 'All properties' : 'Back to FPG'}</button>
      <div className="page-heading"><div><small>FPG · Property management</small><h1>{building?.title || 'Properties'}</h1></div>
        <button className="secondary" onClick={() => open(building || { kind: 'fpg_building' })}>{building ? 'Edit property' : 'Add property'}</button></div>
      {building && (building.address || building.erf) && <p className="muted">{[building.address, building.erf && 'Erf ' + building.erf].filter(Boolean).join(' · ')}</p>}
      {entries.length > 0 && <dl className="stat-grid property-quick-stats" aria-label="Saved property action status">
        <div><dt>Open work</dt><dd>{control.open}</dd></div>
        <div><dt>Urgent</dt><dd>{control.urgent}</dd></div>
        <div><dt>Open budgets</dt><dd>{control.budgets}</dd></div>
        <div><dt>Overdue</dt><dd>{control.overdue}</dd></div>
      </dl>}
      {buildingNumbers.length > 0 && <section className="property-panel">
        <h2>Site numbers</h2>
        <ul>{buildingNumbers.map(([name, label]) =>
          <li key={name} className="row"><span>{label}</span><CallLink value={building[name]} /></li>)}</ul>
      </section>}
      {buildings.size > 0 && <div className="property-capture" aria-label="Quick property capture">
        <button className="property-incident" onClick={() => createEntry('incident', false, true)}><Warning size={21} /> Log incident</button>
        <button onClick={() => createEntry('maintenance', false, true)}><Wrench size={21} /> Maintenance</button>
        <button onClick={() => createEntry('site_report', false, true)}><Camera size={21} /> Site report</button>
        <button onClick={() => createEntry('concern', false, true)}><Plus size={21} /> Tenant concern</button>
      </div>}
      <div className="segmented record-tabs property-tabs" aria-label="Property view">
        <button aria-pressed={tab === 'directory'} onClick={() => setTab('directory')}>Directory</button>
        <button aria-pressed={tab === 'work'} onClick={() => setTab('work')}>Work log</button>
        {Object.entries(registerTabs).map(([id, label]) => <button key={id} aria-pressed={tab === id} onClick={() => setTab(id)}>{label}</button>)}
        {building
          ? <button aria-pressed={tab === 'documents'} onClick={() => setTab('documents')}>Documents</button>
          : <button aria-pressed={tab === 'numbers'} onClick={() => setTab('numbers')}>FPG numbers</button>}
      </div>
      {tab === 'directory' && <Directory key={buildingId} buildings={buildings} tenants={tenants} building={building} selectBuilding={selectBuilding}
        selectTenant={id => { setTenantId(id); window.scrollTo(0, 0); }} day={day} open={open} />}
      {(tab === 'work' || registerTabs[tab]) && <WorkLog key={buildingId + ':' + tab + ':' + (tab === 'work' ? defaultWorkStatus : '')} entries={entries} buildings={buildings}
        tenantNames={tenantNames} building={building} day={day} open={open} createEntry={createEntry}
        initialType={tab === 'work' ? '' : tab} initialStatus={tab === 'work' ? defaultWorkStatus : 'open'} />}
      {tab === 'documents' && building && <BuildingDocuments building={building} documents={records.filter(item => item.kind === 'fpg_document')}
        open={open} downloadDocument={downloadDocument} />}
      {tab === 'numbers' && <FpgNumbers contacts={records.filter(item => item.kind === 'fpg_contact')} open={open} />}
    </div>
    {tenant && <TenantFile tenant={tenant} building={buildings.get(tenant.buildingId)} entries={entries} buildings={buildings} tenantNames={tenantNames}
      day={day} open={open} createEntry={createEntry} back={() => { setTenantId(''); window.scrollTo(0, 0); }} />}
  </div>;
}

import React, { useEffect, useState } from 'react';
import { Dialog } from './Editor.jsx';
import { downloadFile, eventCalendarFile } from './files.js';
import { localTime } from './planning.js';
import { getDocument } from './store.js';
import { fpgNumberCategories, leasingStages, maxPropertyPhotos, preparePropertyPhoto, propertyStatuses, propertyTypes, readFpgNumber, readPropertyRecord, sitePhoneFields, vacancyStages } from './property.js';

function PhotoViewer({ photos }) {
  const [selected, setSelected] = useState(null);
  const [preview, setPreview] = useState(null);
  useEffect(() => {
    if (!selected) return;
    let active = true;
    let url;
    getDocument(selected.path).then(blob => {
      if (!active) return;
      url = URL.createObjectURL(blob);
      setPreview({ photo: selected, url });
    }).catch(() => { if (active) setPreview({ photo: selected, error: true }); });
    return () => { active = false; if (url) URL.revokeObjectURL(url); };
  }, [selected]);

  if (!photos.length) return null;
  return <section className="linked">
    <h3>Saved photos</h3>
    <ul>{photos.map((photo, index) => <li key={photo.path} className="row">
      <span className="file-name">{photo.filename}</span>
      <button type="button" className="quiet" aria-label={(selected === photo ? 'Hide' : 'View') + ' photo ' + (index + 1)}
        onClick={() => { setPreview(null); setSelected(selected === photo ? null : photo); }}>{selected === photo ? 'Hide' : 'View'}</button>
    </li>)}</ul>
    {selected && (preview?.photo !== selected ? <p role="status">Opening photo…</p>
      : preview.error ? <p role="alert">Could not open the photo. Try again.</p>
      : <img className="property-photo" src={preview.url} alt={selected.filename} />)}
  </section>;
}

function Input({ name, label, item, ...options }) {
  return <label>{label}<input name={name} defaultValue={item[name] ?? ''} maxLength="220" {...options} /></label>;
}

function Choice({ name, label, value, choices }) {
  return <label>{label}<select name={name} defaultValue={value}>{Object.entries(choices).map(([id, text]) =>
    <option value={id} key={id}>{text}</option>)}</select></label>;
}

export function DeletePropertyRecord({ item, label, save, close, busy }) {
  const [confirming, setConfirming] = useState(false);
  return <div className="property-delete">
    {confirming ? <>
      <p>Delete {item.title} permanently?</p>
      <div className="section-actions">
        <button type="button" className="secondary" disabled={busy} onClick={() => setConfirming(false)}>Cancel</button>
        <button type="button" className="quiet delete" disabled={busy} onClick={async () => {
          if (await save(item, true)) close();
        }}>Confirm delete</button>
      </div>
    </> : <button type="button" className="quiet delete" disabled={busy} onClick={() => setConfirming(true)}>Delete {label}</button>}
  </div>;
}

export function FpgNumberEditor({ item, close, save, busy, error }) {
  const [id] = useState(() => item.id || crypto.randomUUID());
  const [validation, setValidation] = useState('');

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setValidation('');
    try {
      if (await save(readFpgNumber({ ...item, id }, new FormData(event.currentTarget)))) close();
    } catch (failure) {
      setValidation(failure.message);
    }
  }

  return <Dialog title={item.id ? 'Edit FPG number' : 'Add FPG number'} close={close} busy={busy}>
    <form className="property-form" onSubmit={submit}>
      <fieldset disabled={busy}>
        <Input name="title" label="Name or company" item={item} maxLength="180" required />
        <Choice name="category" label="Category" value={item.category || 'other'} choices={fpgNumberCategories} />
        <Input name="phone" label="Phone number" type="tel" item={item} />
        <Input name="alternatePhone" label="Alternate number" type="tel" item={item} />
        <label>Notes<textarea name="detail" defaultValue={item.detail} rows="3" maxLength="10000" /></label>
      </fieldset>
      {(validation || error) && <p role="alert">{validation || error}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
    </form>
    {item.id && <DeletePropertyRecord item={item} label="number" save={save} close={close} busy={busy} />}
  </Dialog>;
}

export function PropertyEditor({ item, records, day, open, close, save, saveDocument, busy, error }) {
  const [id] = useState(() => item.id || crypto.randomUUID());
  const [buildingId, setBuildingId] = useState(item.buildingId || '');
  const [tenantId, setTenantId] = useState(item.tenantId || '');
  const [propertyType, setPropertyType] = useState(item.propertyType || 'incident');
  const [photos, setPhotos] = useState([]);
  const [validation, setValidation] = useState('');
  const [processing, setProcessing] = useState(false);
  const buildingForm = item.kind === 'fpg_building';
  const tenantForm = item.kind === 'fpg_tenant';
  const logForm = !buildingForm && !tenantForm;
  const meeting = logForm && propertyType === 'meeting';
  const locked = busy || processing;
  const register = ['arrears', 'vacancy', 'budget'].includes(propertyType);
  const trackNotes = ['arrears', 'vacancy'].includes(propertyType);
  const buildings = records.filter(row => row.kind === 'fpg_building').sort((a, b) => a.title.localeCompare(b.title));
  const tenants = records.filter(row => row.kind === 'fpg_tenant' && row.buildingId === buildingId).sort((a, b) => a.title.localeCompare(b.title));
  const historicalTenant = logForm && item.tenantId && item.buildingId === buildingId && !tenants.some(row => row.id === item.tenantId);
  const savedPhotos = item.photos || [];
  const title = buildingForm ? (item.id ? 'Edit property' : 'Add property') : tenantForm ? (item.id ? 'Edit tenant' : 'Add tenant') : item.id ? propertyTypes[propertyType] : item.fixedType ? 'Add ' + propertyTypes[propertyType].toLowerCase() : 'Log property work';

  function addPhotos(event) {
    const picked = Array.from(event.target.files || []);
    event.target.value = '';
    if (!picked.length) return;
    if (picked.length + photos.length + savedPhotos.length > maxPropertyPhotos) {
      setValidation('An entry can hold up to ' + maxPropertyPhotos + ' photos.');
      return;
    }
    setValidation('');
    setPhotos([...photos, ...picked]);
  }

  async function submit(event) {
    event.preventDefault();
    if (locked) return;
    setValidation('');
    setProcessing(true);
    const values = new FormData(event.currentTarget);
    try {
      const record = readPropertyRecord({ ...item, id }, values, propertyType, buildings, tenants);
      const files = [];
      for (const photo of photos) files.push(await preparePropertyPhoto(photo));
      delete record.fixedType;
      if (await (files.length ? saveDocument(record, files) : save(record))) close();
    } catch (failure) {
      setValidation(failure.message || 'Could not save this entry.');
    } finally {
      setProcessing(false);
    }
  }

  return <Dialog title={title} close={close} busy={locked}>
    <form className="property-form" onSubmit={submit}>
      <fieldset disabled={locked}>
        {logForm && !item.id && !item.fixedType && <label>Entry type<select value={propertyType} onChange={event => setPropertyType(event.target.value)}>
          {Object.entries(propertyTypes).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>}
        <Input name="title" label={buildingForm ? 'Property name' : tenantForm ? 'Tenant name' : propertyType === 'vacancy' ? 'Unit or listing name' : 'Title'} item={item} maxLength="180" required />
        {!buildingForm && <label>Property<select name="buildingId" value={buildingId} required onChange={event => { setBuildingId(event.target.value); setTenantId(''); }}>
            <option value="">Choose a property</option>
            {buildings.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}
          </select></label>}
        {buildingForm && <>
          <div className="two-fields"><Input name="code" label="Short code" item={item} maxLength="20" /><Input name="erf" label="Erf or reference" item={item} /></div>
          <Input name="address" label="Street address" item={item} />
          <h3>Site contact numbers</h3>
          {Object.entries(sitePhoneFields).map(([name, label]) => <Input key={name} name={name} label={label} type="tel" item={item} />)}
        </>}
        {tenantForm && <>
          {Object.entries({ units: 'Units or shops', contacts: 'Contact people', phones: 'Phone numbers', emails: 'Email addresses', aliases: 'Other trading names' })
            .map(([name, label]) => <label key={name}>{label}<textarea name={name} rows="2" maxLength="6000" defaultValue={(item[name] || []).join('\n')} placeholder="One per line" /></label>)}
        </>}
        {logForm && <>
          <label>Tenant (optional)<select name="tenantId" value={tenantId} onChange={event => setTenantId(event.target.value)}>
            <option value="">Site-wide or no tenant</option>
            {historicalTenant && <option value={item.tenantId}>{item.tenantName || 'Former tenant'}</option>}
            {tenants.map(row => <option value={row.id} key={row.id}>{row.title}{row.units?.length ? ' · ' + row.units.join(', ') : ''}</option>)}
          </select></label>
          {meeting ? <>
            <Input name="day" label="Meeting date" type="date" item={{ day: item.day || day }} required />
            <div className="two-fields">
              <Input name="start" label="Starts" type="time" item={{ start: item.startsAt ? localTime(item.startsAt) : '' }} required />
              <Input name="end" label="Ends" type="time" item={{ end: item.endsAt ? localTime(item.endsAt) : '' }} required />
            </div>
          </> : <div className="two-fields">
            <Input name="day" label={propertyType === 'arrears' ? 'Record / balance date' : 'Date logged'} type="date" item={{ day: item.day || day }} required />
            <Input name="time" label="Time (SAST)" type="time" item={{ time: item.time || '' }} />
          </div>}
          <Input name="location" label={meeting ? 'Venue or link' : 'Unit or location'} item={item} />
          {propertyType === 'leasing' && <Choice name="stage" label="Leasing stage" value={item.stage || 'enquiry'} choices={leasingStages} />}
          {propertyType === 'arrears' && <Input name="amount" label="Arrears balance (R, optional)" type="number" min="0" max="999999999.99" step=".01"
            item={{ amount: item.amount == null ? '' : item.amount / 100 }} />}
          {propertyType === 'vacancy' && <>
            <Choice name="vacancyStage" label="Availability status" value={item.vacancyStage || ''} choices={{ '': 'Choose a stage', ...vacancyStages }} />
            <div className="two-fields">
              <Input name="floorArea" label="Floor area (m²)" type="number" min=".01" max="9999999" step=".01" item={item} />
              <Input name="availableFrom" label="Available from" type="date" item={item} />
            </div>
          </>}
        </>}
        <label>{trackNotes ? 'Background notes' : logForm ? 'Details or observations' : 'Notes'}<textarea name="detail" defaultValue={item.detail} rows="3" maxLength="10000" /></label>
        {logForm && <>
          <label className="tick"><input name="escalated" type="checkbox" defaultChecked={item.escalated} /> Needs escalation</label>
          {trackNotes && <label>Add a follow-up note<textarea name="followUpNote" rows="3" maxLength="2000" placeholder="Record the call, response or agreed next step" /></label>}
          <details open={register || Boolean(item.owner || item.due || item.reference || item.nextAction || (item.status && item.status !== 'open'))}>
            <summary>Follow-up and status</summary>
            <div className="property-form-fields">
              <Choice name="status" label="Status" value={item.status || 'open'} choices={propertyStatuses} />
              <div className="two-fields"><Input name="owner" label="Owner" item={item} /><Input name="due" label="Follow-up due" type="date" item={item} /></div>
              <Input name="nextAction" label="Next action" item={item} />
              <Input name="reference" label="Reference" item={item} placeholder="e.g. OB number or work order" />
            </div>
          </details>
          {savedPhotos.length < maxPropertyPhotos && <details open={['incident', 'maintenance', 'site_report'].includes(propertyType) || photos.length > 0}>
            <summary>Photos {savedPhotos.length + photos.length > 0 && '· ' + (savedPhotos.length + photos.length)}</summary>
            <div className="property-form-fields">
              <label>Take a photo<input type="file" accept="image/*" capture="environment" onChange={addPhotos} /></label>
              <label>Choose photos<input type="file" accept="image/*" multiple onChange={addPhotos} /></label>
              {photos.length > 0 && <ul>{photos.map((photo, index) => <li className="row" key={index}>
                <span className="file-name">{photo.name}</span>
                <button className="quiet" type="button" aria-label={'Remove photo ' + (index + 1)} onClick={() => {
                  setPhotos(photos.filter((_, position) => position !== index)); setValidation('');
                }}>Remove</button>
              </li>)}</ul>}
            </div>
          </details>}
        </>}
      </fieldset>
      {(validation || error) && <p role="alert">{validation || error}</p>}
      <button className="primary" disabled={locked}>{locked ? 'Saving…' : 'Save'}</button>
    </form>
    {trackNotes && Boolean(item.followUpNotes?.length) && <section className="linked">
      <h3>Follow-up history</h3>
      <ul>{[...item.followUpNotes].reverse().map((note, index) => <li className="property-follow-up" key={index}>
        <time dateTime={note.at}>{new Intl.DateTimeFormat('en-ZA', {
          dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg',
        }).format(new Date(note.at))}</time>
        <p className="property-note">{note.text}</p>
      </li>)}</ul>
    </section>}
    <PhotoViewer photos={savedPhotos} />
    {tenantForm && item.id && <div className="linked">
      <h3>Linked property work</h3>
      <ul>{records.filter(row => row.tenantId === item.id).map(row => <li key={row.id} className="row">
        <button className="row-detail" disabled={locked} onClick={() => open(row)}>{row.title}<small>{propertyTypes[row.propertyType]} · {propertyStatuses[row.status]}</small></button>
      </li>)}</ul>
      <button type="button" className="secondary" disabled={locked} onClick={() => open({ kind: 'fpg_log', buildingId, tenantId: item.id, propertyType: 'concern' })}>Log for this tenant</button>
    </div>}
    {tenantForm && item.id && <DeletePropertyRecord item={item} label="tenant" save={save} close={close} busy={locked} />}
    {meeting && item.id && <button type="button" className="quiet" onClick={() => downloadFile(eventCalendarFile(item), 'mjw-property-meeting.ics', 'text/calendar')}>Download calendar reminder</button>}
  </Dialog>;
}

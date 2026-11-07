import React, { useState } from 'react';
import { ArrowRight, Buildings, House, Phone, ShieldPlus, Users } from '@phosphor-icons/react';
import { downloadFile } from './files.js';
import { prettyDate } from './model.js';
import { advanceHouseItem, homeCategories, tel } from './personal-model.js';

function PhoneLink({ label, number }) {
  const href = tel(number);
  return href ? <a className="quiet contact-link" href={href}><Phone size={16} /> {label} · {number}</a>
    : number ? <p>{label} · {number}</p> : null;
}

export function Family({ records, open }) {
  const people = records.filter(item => item.kind === 'person').sort((a, b) => a.title.localeCompare(b.title));
  return <section className="feature-section">
    <div className="section-actions"><Users size={21} /><h2>Family members</h2><button className="quiet" onClick={() => open({ kind: 'person', area: 'family' })}>Add family member</button></div>
    <p className="muted">Keep contact details, birthdays and emergency contacts together.</p>
    {people.length === 0 && <p className="muted">Add the people you want to keep here.</p>}
    <ul>{people.map(item => <li className="row family-row" key={item.id}>
      <button className="row-detail" onClick={() => open(item)}><span>{item.title}<small>{[item.relationship, item.birthday ? 'Birthday ' + prettyDate(item.birthday) : item.birthdayNote && 'Birthday ' + item.birthdayNote, item.emergencyContact && 'Emergency contact'].filter(Boolean).join(' · ')}</small></span></button>
      {tel(item.phone) && <a href={tel(item.phone)} className="quiet contact-link" aria-label={'Call ' + item.title}><Phone size={19} /> Call</a>}
    </li>)}</ul>
  </section>;
}

const emergencyNumbers = [
  ['Mobile emergency', '112'], ['Ambulance', '10177'], ['Police', '10111'], ['Cape Town emergency from a landline', '107'],
];

export function Emergency({ records, day, open, openProperties }) {
  const profile = records.find(item => item.kind === 'emergency');
  const contacts = records.filter(item => item.kind === 'person' && item.emergencyContact);
  const meds = records.filter(item => item.kind === 'medication' && item.area === 'mornay' && item.day <= day && (!item.endedOn || day < item.endedOn));
  const fields = [
    ['Home address', profile?.address], ['Allergies', profile?.allergies], ['Important conditions', profile?.conditions],
    ['Medication instructions', profile?.medications], ['Medical aid', [profile?.medicalAid, profile?.plan].filter(Boolean).join(' · ')],
    ['Member number', profile?.member], ['Gap cover', profile?.gapCover], ['Doctor or practice', profile?.doctor], ['Other information', profile?.detail],
  ].filter(([, value]) => value);
  function copyCard() {
    const data = ['MJW Life emergency card', profile?.title, 'Reviewed: ' + (profile?.updatedOn || 'Not recorded'),
      ...fields.map(([label, value]) => label + ': ' + value),
      ...meds.map(item => 'Medication: ' + [item.title, item.strength, item.times?.join(', ')].filter(Boolean).join(' · ')),
      ...contacts.map(item => 'Emergency contact: ' + [item.title, item.relationship, item.phone, item.alternatePhone].filter(Boolean).join(' · ')),
      profile?.otherContact && 'Additional contact: ' + [profile.otherContact, profile.otherPhone].filter(Boolean).join(' · '),
      profile?.doctorPhone && 'Doctor: ' + profile.doctorPhone,
      profile?.insurerPhone && 'Medical aid phone: ' + profile.insurerPhone,
      ...emergencyNumbers.map(([label, number]) => label + ': ' + number),
    ].filter(Boolean);
    downloadFile(data.join('\n') + '\n', 'mjw-emergency-card.txt', 'text/plain');
  }
  return <div className="screen inside emergency-page">
    <div className="page-heading"><h1><ShieldPlus size={27} /> Emergency</h1><button className="secondary" onClick={() => open(profile || { id: 'emergency-card', kind: 'emergency', area: 'mornay' })}>{profile ? 'Edit card' : 'Set up card'}</button></div>
    {profile ? <><h2>{profile.title}</h2><small>Reviewed {prettyDate(profile.updatedOn)}</small><dl className="emergency-details">{fields.map(([label, value]) =>
      <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></> : <p className="muted">Add your address, medical aid and the details you want responders to have.</p>}
    {meds.length > 0 && <section className="feature-section"><h2>Medication tracker</h2><ul>{meds.map(item =>
      <li className="row" key={item.id}><span>{item.title}<small>{[item.strength, item.times?.join(', ')].filter(Boolean).join(' · ')}</small></span></li>)}</ul></section>}
    <section className="feature-section"><h2>People to call</h2>
      {contacts.length === 0 && !profile?.otherPhone && <p className="muted">Mark a family member as an emergency contact or add one on your card.</p>}
      <ul>{contacts.map(item => <li key={item.id} className="row family-row"><button className="row-detail" onClick={() => open(item)}>{item.title}<small>{item.relationship}</small></button>
        <div><PhoneLink label="Call" number={item.phone} /><PhoneLink label="Alternate" number={item.alternatePhone} /></div></li>)}</ul>
      <PhoneLink label={profile?.otherContact || 'Additional contact'} number={profile?.otherPhone} />
      <PhoneLink label={profile?.doctor || 'Doctor'} number={profile?.doctorPhone} />
      <PhoneLink label="Medical aid" number={profile?.insurerPhone} />
    </section>
    <section className="feature-section"><h2>Emergency numbers</h2>
      {emergencyNumbers.map(([label, number]) => <PhoneLink key={number} label={label} number={number} />)}
      <a className="quiet contact-link" href="https://www.westerncape.gov.za/health-wellness/know-who-you-can-call-emergency" target="_blank" rel="noopener noreferrer">Western Cape emergency numbers</a>
    </section>
    <button className="summary-row property-home-link" onClick={openProperties}>
      <Buildings size={22} /><span><strong>FPG property contacts</strong><small>Find a site or tenant number</small></span><ArrowRight size={18} />
    </button>
    {(profile || contacts.length > 0 || meds.length > 0) && <details><summary>Keep an offline copy</summary>
      <p className="muted">The downloaded card includes the private details shown here. Keep it somewhere you can access in an emergency.</p>
      <button className="secondary" onClick={copyCard}>Download emergency card</button></details>}
  </div>;
}

export function HouseLists({ records, day, open, save, busy }) {
  const [category, setCategory] = useState('shopping');
  const [quick, setQuick] = useState('');
  const [showDone, setShowDone] = useState(false);
  const list = records.filter(item => item.kind === 'house_item' && item.category === category && (showDone || !item.completed))
    .sort((a, b) => Number(Boolean(b.priority)) - Number(Boolean(a.priority)) || (a.due || '9999').localeCompare(b.due || '9999'));
  async function add(event) {
    event.preventDefault();
    const title = quick.trim();
    if (!title) return;
    if (await save({ id: crypto.randomUUID(), kind: 'house_item', area: 'house', category, title })) setQuick('');
  }
  return <section className="feature-section">
    <div className="section-actions"><House size={22} /><h2>House lists</h2></div>
    <div className="segmented record-tabs" aria-label="House list">{Object.entries(homeCategories).map(([id, label]) =>
      <button key={id} aria-pressed={category === id} onClick={() => { setCategory(id); setQuick(''); }}>{label}</button>)}</div>
    <form className="quick-line" onSubmit={add}>
      <label>Quick add to {homeCategories[category]}<input value={quick} onChange={event => setQuick(event.target.value)} maxLength={180} placeholder="What do you need?" /></label>
      <button className="secondary" disabled={busy || !quick.trim()}>Add</button>
    </form>
    <div className="section-actions"><button className="quiet" onClick={() => open({ kind: 'house_item', area: 'house', category })}>Add with details</button>
      <label className="tick"><input type="checkbox" checked={showDone} onChange={event => setShowDone(event.target.checked)} /> Show completed</label></div>
    {list.length ? <ul>{list.map(item => <li className="row" key={item.id}>
      <button className="row-detail" onClick={() => open(item)}><span>{item.title}<small>{[item.quantity, item.due && prettyDate(item.due), item.priority && 'Needs attention', item.completed && 'Done'].filter(Boolean).join(' · ')}</small></span></button>
      <button className="quiet" disabled={busy} onClick={() => save(advanceHouseItem(item, day))}>{item.completed ? 'Reopen' : item.repeat ? 'Log done' : 'Done'}</button>
    </li>)}</ul> : <p className="muted">No open items in this list.</p>}
  </section>;
}

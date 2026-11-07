import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Buildings, CalendarBlank, CalendarDots, Check, GearSix, Microphone, Phone, Plus, Receipt, ShieldPlus, ShoppingCart, SquaresFour, Tray } from '@phosphor-icons/react';
import { areas, dailyPlan, dateKey, money, prettyDate, riskSignals, shiftDay, weekStart } from './model.js';
import { availability, eventOn, eventTypes, isEvent, localTime } from './planning.js';
import { demo, getDocument, getGmailCheckpoint, insertRecords, loadRecords, removeDocument, saveGmailRefresh, storeDocument, supabase, writeRecord, writeRecords } from './store.js';
import { Calendar } from './Calendar.jsx';
import { Dialog, Editor } from './Editor.jsx';
import { Inbox, Records, Settings, inInbox } from './Records.jsx';
import { BankAccounts, TaxLog, TravelLog } from './FinanceLogs.jsx';
import { Emergency, Family, HouseLists } from './Personal.jsx';
import { GmailRefresh } from './GmailRefresh.jsx';
import { Budget } from './Budget.jsx';
import { ActionControl } from './ActionControl.jsx';
import { Medication } from './Medication.jsx';
import { downloadFile } from './files.js';
import { Properties } from './Properties.jsx';
import { FpgNumberEditor, PropertyEditor } from './PropertyEditor.jsx';
import { BuildingDocumentEditor } from './BuildingDocuments.jsx';
import { isPropertyRecord, propertyAttention } from './property.js';

const tabs = [
  ['today', 'Today', CalendarBlank], ['calendar', 'Calendar', CalendarDots],
  ['inbox', 'Inbox', Tray], ['areas', 'Areas', SquaresFour],
];
const time = minutes => minutes < 60 ? minutes + ' min' : Math.floor(minutes / 60) + 'h' + (minutes % 60 ? ' ' + minutes % 60 + 'm' : '');

export function App() {
  const [session, setSession] = useState(undefined);
  const [membership, setMembership] = useState(null);
  const [authError, setAuthError] = useState('');
  const [activate, setActivate] = useState(false);
  const [authNotice, setAuthNotice] = useState('');
  const [signingIn, setSigningIn] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  useEffect(() => {
    if (!userId) return;
    let active = true;
    supabase.rpc('activate_life_workspace')
      .then(({ data, error }) => {
        if (active) setMembership({ userId, allowed: Boolean(data), failed: Boolean(error) });
      });
    return () => { active = false; };
  }, [userId]);

  async function signIn(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setSigningIn(true);
    setAuthError('');
    setAuthNotice('');
    const credentials = { email: form.get('email'), password: form.get('password') };
    try {
      const { error } = activate
        ? await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo: window.location.origin } })
        : await supabase.auth.signInWithPassword(credentials);
      if (error) throw error;
      if (activate) {
        setActivate(false);
        setAuthNotice('Check your inbox to confirm your email, then sign in.');
      }
    } catch {
      setAuthError(activate ? 'Could not start activation. Try again shortly.' : 'Sign-in failed. Check your account details and try again.');
    } finally {
      setSigningIn(false);
    }
  }

  if (demo || (userId && membership?.userId === userId && membership.allowed)) return <Workspace key={session?.user.id || 'demo'} session={session} />;
  if (supabase && (session === undefined || (session && membership?.userId !== userId))) return <Splash />;
  return <div className="gate"><Brand /><main>
    <h1>Private workspace</h1>
    {!supabase ? <p>This deployment needs a Supabase connection.</p>
      : session ? <><p>{membership.failed ? 'Could not verify workspace access.' : 'This account has not been enrolled.'}</p><button className="quiet" onClick={() => supabase.auth.signOut()}>Sign out</button></>
      : <form onSubmit={signIn} key={activate}>
        <label>Email<input name="email" type="email" autoComplete="username" required /></label>
        <label>Password<input name="password" type="password" autoComplete={activate ? "new-password" : "current-password"} minLength={activate ? 8 : undefined} required /></label>
        <button className="primary" disabled={signingIn}>{signingIn ? 'Working…' : activate ? 'Create password' : 'Sign in'}</button>
        <button className="quiet" type="button" disabled={signingIn} onClick={() => {
          setActivate(!activate); setAuthError(''); setAuthNotice('');
        }}>{activate ? 'Back to sign in' : 'Activate invited account'}</button>
        {activate && <small>Use the email address invited to the workspace.</small>}
        {authNotice && <p role="status">{authNotice}</p>}
        {authError && <p role="alert">{authError}</p>}
      </form>}
  </main></div>;
}

/** Official MJW Life marks. The ribbon is the platform's recognisable symbol. */
function Brand() {
  return <img className="brand" src="/brand/mjw-life.webp" alt="MJW Life" width="1200" height="327" decoding="async" />;
}

function RibbonMark({ className = '' }) {
  return <img className={['ribbon-mark', className].filter(Boolean).join(' ')} src="/brand/mjw-ribbon.png" alt="" aria-hidden="true" width="192" height="192" decoding="async" />;
}

function Splash() {
  return <div className="boot-screen" role="status"><RibbonMark className="splash-ribbon" /><span className="sr-only">Opening MJW Life</span></div>;
}

function Workspace({ session }) {
  const [records, setRecords] = useState(null);
  const [view, setView] = useState('today');
  const [area, setArea] = useState(null);
  const [financeView, setFinanceView] = useState('budget');
  const [editor, setEditor] = useState(null);
  const [focus, setFocus] = useState(null);
  const [choosing, setChoosing] = useState(false);
  const [calendarDate, setCalendarDate] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [guidance, setGuidance] = useState('');
  const [guidanceBusy, setGuidanceBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [day, setDay] = useState(dateKey);
  const lock = useRef(false);
  const userId = session?.user.id;

  useEffect(() => {
    let active = true;
    loadRecords(userId).then(result => { if (active) setRecords(result); })
      .catch(() => { if (active) setError('Could not load your workspace.'); });
    return () => { active = false; };
  }, [userId, reload]);

  useEffect(() => {
    const update = () => setDay(dateKey());
    const timer = window.setInterval(update, 30000);
    window.addEventListener('focus', update);
    return () => { window.clearInterval(timer); window.removeEventListener('focus', update); };
  }, []);

  function open(item) {
    setError('');
    setEditor(item);
  }

  function closeEditor() {
    setEditor(null);
    setError('');
  }

  async function save(record, remove = false) {
    if (lock.current || !records) return false;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const parent = records.find(item => item.id === record.relatedId);
      if (!remove && parent && record.area !== parent.area && ['task', 'note', 'document'].includes(record.kind)) {
        setError('Choose the same area as the related record.');
        return false;
      }
      if (!remove && record.kind === 'budget' && records.some(item => item.id !== record.id && item.kind === 'budget' &&
        item.month === record.month && item.title.toLowerCase() === record.title.toLowerCase())) {
        setError('This category already has a budget for the selected month.');
        return false;
      }
      if (remove && ['document', 'tax_receipt'].includes(record.kind) && record.path) await removeDocument(record.path);
      setRecords(await writeRecord(userId, records, record, remove));
      if (remove && record.kind === 'fpg_document' && record.path) await removeDocument(record.path).catch(() => null);
      setGuidance('');
      return true;
    } catch (failure) {
      setError(isPropertyRecord(record) && failure instanceof Error ? failure.message : 'The change could not be saved. Try again.');
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function saveDocument(record, file) {
    return saveAttachments([{ record, file }]);
  }

  async function saveAttachments(entries) {
    if (lock.current || !records) return false;
    lock.current = true;
    setBusy(true);
    setError('');
    const uploads = [];
    const replacedPaths = entries.filter(({ record }) => record.kind === 'fpg_document' && record.path).map(({ record }) => record.path);
    let writing = false;
    try {
      const updated = [];
      for (const { record, file } of entries) {
        const parent = records.find(item => item.id === record.relatedId);
        if (parent && parent.area !== record.area) throw new Error('Choose the same area as the related record.');
        const photos = Array.isArray(file);
        const files = [];
        for (const attachment of photos ? file : [file]) {
          const upload = await storeDocument(userId, attachment);
          uploads.push({ id: record.id, path: upload.path });
          files.push(upload);
        }
        updated.push(photos ? { ...record, photos: [...(record.photos || []), ...files] } : { ...record, ...files[0] });
      }
      writing = true;
      const next = updated.length === 1 ? await writeRecord(userId, records, updated[0])
        : await writeRecords(userId, records, updated, { insertOnly: true });
      setRecords(next);
      await Promise.allSettled(replacedPaths.map(path => removeDocument(path)));
      return true;
    } catch (failure) {
      if (uploads.length) {
        const current = writing ? await loadRecords(userId).catch(() => null) : records;
        const saved = new Map(current?.map(item => [item.id, item]));
        const attached = ({ id, path }) => saved.get(id)?.path === path || saved.get(id)?.photos?.some(photo => photo.path === path);
        if (current && uploads.every(attached)) {
          setRecords(current);
          await Promise.allSettled(replacedPaths.map(path => removeDocument(path)));
          return true;
        }
        if (current) await Promise.allSettled(uploads
          .filter(upload => !attached(upload))
          .map(upload => removeDocument(upload.path)));
      }
      setError(failure instanceof Error ? failure.message : 'The document could not be saved.');
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function downloadDocument(item) {
    try { downloadFile(await getDocument(item.path), item.filename || 'document'); return true; }
    catch { return false; }
  }

  async function importRecords(items) {
    if (lock.current || !records || !items.length) return false;
    lock.current = true;
    setBusy(true);
    try {
      setRecords(await insertRecords(userId, records, items));
      return true;
    } catch {
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function commitGmail(key, expected, checkpoint, messages) {
    if (lock.current) throw new Error('A workspace change is in progress. Try again.');
    lock.current = true;
    setBusy(true);
    try { setRecords(await saveGmailRefresh(userId, key, expected, checkpoint, messages)); }
    finally { lock.current = false; setBusy(false); }
  }

  function showArea(id, subview = 'budget') {
    navigate('areas');
    setArea(id);
    setFinanceView(subview);
  }

  function navigate(tab, date = '') {
    setView(tab);
    setCalendarDate(date);
    setArea(null);
    setChoosing(false);
    window.scrollTo(0, 0);
  }

  const list = records || [];
  const areaList = [...areas.map(item => list.find(record => record.id === item.id && record.kind === 'area') || item),
    ...list.filter(item => item.kind === 'area' && !areas.some(base => base.id === item.id))];
  const currentArea = areaList.find(item => item.id === area);
  const areaName = id => areaList.find(item => item.id === id)?.title || 'Unassigned';
  const capacity = list.find(item => item.id === 'capacity:' + day) ||
    { id: 'capacity:' + day, kind: 'capacity', minutes: null, essentials: false };
  const { today, planned, waiting } = dailyPlan(list, day, capacity.essentials);
  const activeEvents = list.filter(item => isEvent(item) && !item.completed && !item.suggested);
  const eventsOn = date => activeEvents.map(item => eventOn(item, date)).filter(Boolean);
  const events = eventsOn(day).sort((a, b) => (a.startsAt || '').localeCompare(b.startsAt || ''));
  const upcoming = events.find(item => item.startsAt && (!item.endsAt || Date.parse(item.endsAt) > Date.now())) || events.find(item => !item.startsAt);
  const available = availability(capacity, events, day);
  const priority = today.find(item => item.id === capacity.focusId) || today[0];
  const candidates = list.filter(item => item.kind === 'task' && !isEvent(item) && !item.suggested && !item.completed &&
    ['open', 'escalated'].includes(item.status) && (!capacity.essentials || item.essential || item.status === 'escalated'));
  const riskEvents = Array.from({ length: 8 }, (_, index) => shiftDay(day, index)).flatMap(date => eventsOn(date)
    .filter(item => item.repeat || item.planned === date || date === day).map(item => ({ ...item, planned: date })));
  const risks = riskSignals([...list.filter(item => !isEvent(item)), ...riskEvents], day, available, planned);
  const houseDue = list.filter(item => item.kind === 'house_item' && !item.completed && (item.priority || item.due && item.due <= day));
  if (houseDue.length) risks.push({ title: 'House items to check', detail: houseDue[0].title, item: houseDue[0] });
  const workDue = propertyAttention(list, day);
  if (workDue.length) risks.push({ title: 'FPG property work needs attention', detail: workDue.length + (workDue.length === 1 ? ' entry' : ' entries') + ' · ' + workDue[0].title, view: 'fpg_attention' });
  const doneToday = list.filter(item => item.kind === 'task' && item.completed === day).length;
  const inboxCount = list.filter(inInbox).length;
  const habits = list.filter(item => item.kind === 'habit');
  const checkinId = id => 'checkin:' + id + ':' + day;
  const checked = id => list.some(item => item.id === checkinId(id));
  const toggleHabit = id => save({ id: checkinId(id), kind: 'checkin', habit: id, day }, checked(id));
  const start = weekStart(day);
  const review = list.find(item => item.id === 'review:' + start);
  const weekEnd = shiftDay(start, 6);
  const inWeek = key => key && key >= start && key <= weekEnd;
  const closedThisWeek = list.filter(item => item.kind === 'task' && inWeek(item.completed)).length;
  const habitsThisWeek = list.filter(item => item.kind === 'checkin' && inWeek(item.day)).length;
  const nextUp = today.filter(item => item.id !== priority?.id).slice(0, 4);
  const complete = item => save({ ...item, status: 'done', completed: day });

  async function choosePriority(item) {
    if (lock.current || !records) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const picked = item.planned === day ? [] : [{ ...item, planned: day }];
      setRecords(await writeRecords(userId, records, [...picked, { ...capacity, focusId: item.id }]));
      setChoosing(false);
    } catch {
      setError('Could not save today’s priority. Try again.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function askGuidance() {
    setGuidanceBusy(true);
    setGuidance('');
    try {
      const response = await fetch('/api/guidance', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ available, planned, due: today.filter(item => item.due && item.due <= day).length, waiting: waiting.length }),
      });
      const result = await response.json();
      setGuidance(response.ok ? result.text : result.error || 'Planning guidance is unavailable.');
    } catch {
      setGuidance('Planning guidance is unavailable.');
    } finally {
      setGuidanceBusy(false);
    }
  }

  function renderRow(item) {
    const action = item.suggested ? null : item.kind === 'habit' ? () => toggleHabit(item.id)
      : item.kind === 'task' && !isEvent(item) && !item.completed ? () => complete(item) : null;
    const done = item.kind === 'habit' ? checked(item.id) : Boolean(item.completed);
    const meta = isEvent(item) ? [item.startsAt ? localTime(item.startsAt) : 'All day', eventTypes[item.eventType] || 'Event',
      item.provenance?.includes('RSVP pending') && 'Response needed'].filter(Boolean).join(' · ')
      : item.kind === 'goal' ? item.progress + ' of ' + item.target + ' milestones'
      : item.kind === 'expense' ? [money(item.amount), item.day && prettyDate(item.day), item.category].filter(Boolean).join(' · ')
      : item.kind === 'task' ? [item.owner, item.due && 'Due ' + prettyDate(item.due), item.followup && 'Follow up ' + prettyDate(item.followup),
        ({ waiting: 'Waiting', escalated: 'Escalated', done: 'Done' })[item.status]].filter(Boolean).join(' · ') : item.day || '';
    return <li className="row" key={item.id}>
      {action && <button type="button" className="checkbox" aria-label={(done ? 'Undo ' : 'Complete ') + item.title} aria-pressed={done} disabled={busy} onClick={action}>{done && <Check weight="bold" />}</button>}
      <button className="row-detail" onClick={() => open(item)}><span>{item.title}{meta && <small>{meta}</small>}</span><ArrowRight size={18} /></button>
    </li>;
  }

  function areaStatus(item) {
    const due = list.filter(record => record.area === item.id && record.kind === 'task' && !isEvent(record) &&
      !record.suggested && !record.completed && (record.due && record.due <= day || record.status === 'waiting' && record.followup && record.followup <= day)).length;
    if (due) return due + (due === 1 ? ' item needs attention' : ' items need attention');
    const nextDate = Array.from({ length: 30 }, (_, index) => shiftDay(day, index))
      .find(date => activeEvents.some(record => record.area === item.id && eventOn(record, date)));
    return nextDate ? 'Next event ' + prettyDate(nextDate) : item.detail;
  }

  const propertyView = ['properties', 'fpg_numbers', 'fpg_attention', 'fpg_budgets'].includes(view);
  const navView = view === 'catchup' ? 'today' : propertyView || ['records', 'audio', 'goals', 'review', 'emergency'].includes(view) ? 'areas' : view;
  if (!records && !error) return <Splash />;
  let editDialog;
  if (editor) {
    const editorProps = { item: editor, close: closeEditor, save, busy, error };
    const key = editor.id || [editor.kind, editor.buildingId, editor.tenantId, editor.propertyType].join(':');
    if (editor.kind === 'fpg_document') {
      editDialog = <BuildingDocumentEditor key={key} {...editorProps} building={list.find(item => item.id === editor.buildingId && item.kind === 'fpg_building')}
        day={day} saveAttachments={saveAttachments} />;
    } else if (editor.kind === 'fpg_contact') {
      editDialog = <FpgNumberEditor key={key} {...editorProps} />;
    } else if (isPropertyRecord(editor)) {
      editDialog = <PropertyEditor key={key} {...editorProps} records={list} day={day} open={open} saveDocument={saveDocument} />;
    } else {
      editDialog = <Editor key={[editor.id, editor.kind, editor.relatedId].join(':')} {...editorProps} day={day} areas={areaList}
        saveDocument={saveDocument} downloadDocument={downloadDocument}
        related={editor.id ? list.filter(item => item.area === editor.area && (item.relatedId === editor.id || item.id === editor.relatedId)) : []} open={open} />;
    }
  }
  return <div className="shell">
    <header className="header"><button className="brand-button" aria-label="MJW Life home" onClick={() => navigate('today')}><Brand /></button><div className="header-actions">
      {demo && <span className="demo">Sample data</span>}
      <button className="quiet icon-button" aria-label="Settings" onClick={() => navigate('settings')}><GearSix size={24} /></button>
      <button className="secondary add-action" disabled={!records} onClick={() => open({ kind: 'task', area: propertyView ? 'fpg' : area || 'mornay' })}><Plus size={18} weight="bold" /> Add</button>
    </div></header>
    <main id="main">
      {!records ? <div className="screen"><p role="status">{error || 'Loading your workspace…'}</p>{error && <button className="secondary" onClick={() => { setError(''); setReload(reload + 1); }}>Try again</button>}</div> : <>
        {error && !editor && !focus && <p className="notice" role="alert">{error}</p>}
        {view === 'today' && <div className="screen today-grid">
          <section className="main-deck">
            <div className="page-heading"><div><small>{prettyDate(day)}</small><h1>Today</h1></div>
              <button className="emergency-shortcut" onClick={() => navigate('emergency')}><ShieldPlus size={19} /> Emergency</button>
            </div>
            <div className="quick-actions" aria-label="Quick capture">
              <button onClick={() => open({ kind: 'task', area: 'mornay' })}><Plus size={22} /> Task</button>
              <button onClick={() => navigate('audio')}><Microphone size={22} /> Voice</button>
              <button onClick={() => open({ kind: 'tax_receipt', area: 'finance', day })}><Receipt size={22} /> Receipt</button>
              <button onClick={() => open({ kind: 'house_item', area: 'house', category: 'shopping' })}><ShoppingCart size={22} /> Shopping</button>
            </div>
            <button className="summary-row control-home-link" onClick={() => navigate('catchup')}>
              <Tray size={22}/><span><strong>Catch-up and action control</strong><small>Open budgets, overdue follow-ups and recent activity</small></span><ArrowRight size={18}/>
            </button>
            <button className="summary-row property-home-link" onClick={() => navigate('properties')}>
              <Buildings size={22} /><span><strong>FPG Properties</strong><small>Find a tenant or log site work</small></span><ArrowRight size={18} />
            </button>
            {upcoming ? <button className="summary-row" onClick={() => open(list.find(item => item.id === upcoming.id) || upcoming)}>
              <CalendarDots size={22} /><span><small>Next on your calendar · {upcoming.startsAt ? localTime(upcoming.startsAt) : 'All day'}</small><strong>{upcoming.title}</strong></span><ArrowRight size={18} />
            </button> : <button className="summary-row" onClick={() => navigate('calendar')}><CalendarDots size={22} /><span><strong>Nothing else scheduled today</strong><small>View upcoming days</small></span><ArrowRight size={18} /></button>}
            {risks.length > 0 && <section className="attention">
              <h2>Needs attention</h2><ul>{risks.map(risk => <li key={risk.title}><button className="row-detail" onClick={() => risk.view ? navigate(risk.view) : risk.day ? navigate('calendar', risk.day) : open(risk.item || capacity)}><span>{risk.title}<small>{risk.detail}</small></span><ArrowRight size={18} /></button></li>)}</ul>
            </section>}
            <section className="priority-card">
              <div className="section-actions"><h2>Today’s priority</h2>{priority && <button className="quiet" onClick={() => setChoosing(true)}>Change</button>}</div>
              {priority ? <><h3>{priority.title}</h3>
                <p className="muted">{areaName(priority.area)}{priority.minutes ? ' · ' + time(priority.minutes) : ''}</p>
                <button className="primary" onClick={() => setFocus(priority)}>Open priority <ArrowRight size={20} /></button></>
                : <><p className="muted">Choose one thing to move forward.</p><button className="secondary" onClick={() => candidates.length ? setChoosing(true) : open({ kind: 'task', area: 'mornay', planned: day })}>{candidates.length ? 'Pick a task' : 'Add a task'}</button></>}
            </section>
            {doneToday > 0 && <p className="success" role="status">{doneToday} {doneToday === 1 ? 'task' : 'tasks'} finished today</p>}
            <div className="workload">
              <button className="workload-label" onClick={() => open(capacity)}>
                <span><strong>{time(planned)}</strong> planned{available !== null && ' / ' + time(available) + (capacity.start ? ' free' : ' set by you')}</span>
                <span className="small-link">{available === null ? 'Set available time' : 'Change time'}</span>
              </button>
              {available !== null && <progress aria-label="Daily workload" className={planned > available ? 'over' : ''} max={Math.max(1, available)} value={Math.min(planned, Math.max(1, available))} />}
              {capacity.essentials && <p className="muted">Essentials only is on.</p>}
            </div>
          </section>
          <aside className="side-deck">
            {nextUp.length > 0 && <section><h2>Work on today</h2><ul>{nextUp.map(renderRow)}</ul></section>}
            {waiting.length > 0 && <section><h2>Waiting on others</h2><ul>{waiting.slice(0, 5).map(renderRow)}</ul></section>}
            <section><h2>Keep going</h2><p className="muted">{closedThisWeek} completed · {habitsThisWeek} habit check-ins</p>
              <button className="quiet" onClick={() => navigate('review')}>Weekly review</button>
              {inboxCount > 0 && <button className="quiet" onClick={() => navigate('inbox')}>Review inbox ({inboxCount})</button>}
              {session && available !== null && <details><summary>Planning guidance</summary><small>Uses planning totals only.</small>
                <button className="quiet" disabled={guidanceBusy} onClick={askGuidance}>{guidanceBusy ? 'Preparing guidance…' : 'Get guidance'}</button>
                {guidance && <p role="status">{guidance}</p>}</details>}
              {habits.some(item => !checked(item.id)) && !capacity.essentials && <ul>{habits.filter(item => !checked(item.id)).slice(0, 1).map(renderRow)}</ul>}
            </section>
          </aside>
        </div>}
        {view === 'catchup' && <ActionControl records={list} day={day} open={open} back={() => navigate('today')}
          openInbox={() => navigate('inbox')} openProperties={() => navigate('fpg_budgets')}/>}
        {view === 'calendar' && <Calendar key={calendarDate || 'today'} records={list} day={day} initialDate={calendarDate} areas={areaList} open={open} />}
        {view === 'inbox' && <Inbox records={list} day={day} open={open} save={save} busy={busy}
          refresh={<GmailRefresh records={list} areas={areaList} readCheckpoint={key => getGmailCheckpoint(userId, key)} commit={commitGmail} settings={() => navigate('settings')} />} />}
        {view === 'settings' && <Settings records={list} areas={areaList} importRecords={importRecords} signOut={demo ? undefined : async () => {
          const { error } = await supabase.auth.signOut();
          if (error) setError('Sign-out failed. Try again.');
        }} />}
        {(view === 'records' || view === 'audio') && <Records key={view} initialKind={view === 'audio' ? 'audio' : 'note'} records={list} areas={areaList} day={day} open={open} userId={userId || 'demo'} downloadDocument={downloadDocument} />}
        {view === 'emergency' && <Emergency records={list} day={day} open={open} openProperties={() => navigate('properties')}
          openFpgNumbers={() => navigate('fpg_numbers')} />}
        {propertyView && <Properties key={view} records={list} day={day} open={open} back={() => showArea('fpg')}
          initialTab={{ fpg_numbers: 'numbers', fpg_attention: 'work', fpg_budgets: 'budget' }[view]}
          initialStatus={view === 'fpg_attention' ? 'attention' : 'open'} downloadDocument={downloadDocument} />}
        {view === 'areas' && <div className="screen inside">
          <div className="page-heading"><h1>{currentArea?.title || 'Areas'}</h1>
            {currentArea ? <button className="quiet" onClick={() => setArea(null)}>All areas</button> : <button className="quiet" onClick={() => open({ kind: 'area' })}>Add area</button>}
          </div>
          {currentArea ? <>
            {area === 'fpg' && <><button className="summary-row control-home-link" onClick={() => navigate('catchup')}>
              <Tray size={22} /><span><strong>Catch-up</strong><small>Urgent matters, budgets and follow-ups</small></span><ArrowRight size={18} />
            </button><button className="summary-row property-home-link" onClick={() => navigate('properties')}>
              <Buildings size={22} /><span><strong>Properties</strong><small>Tenant files, arrears, vacancies and site work</small></span><ArrowRight size={18} />
            </button><button className="summary-row property-home-link" onClick={() => navigate('fpg_budgets')}>
              <CalendarDots size={22} /><span><strong>Property budgets</strong><small>Deadlines, submissions and follow-ups</small></span><ArrowRight size={18} />
            </button><button className="summary-row property-home-link" onClick={() => navigate('fpg_numbers')}>
              <Phone size={22} /><span><strong>Important FPG numbers</strong><small>Colleagues, security and service providers</small></span><ArrowRight size={18} />
            </button></>}
            <div className="section-actions"><button className="secondary" onClick={() => open({ kind: 'task', area })}>Add item</button><button className="quiet" onClick={() => open(currentArea)}>Edit area</button></div>
            {currentArea.id === 'finance' && <>
              <div className="segmented record-tabs" aria-label="Finance view">{Object.entries({ budget: 'Budget', accounts: 'Accounts', travel: 'Travel', sars: 'SARS' }).map(([id, label]) =>
                <button key={id} aria-pressed={financeView === id} onClick={() => setFinanceView(id)}>{label}</button>)}</div>
              {financeView === 'budget' && <Budget records={list} day={day} open={open} save={save} importRecords={importRecords} renderRow={renderRow} busy={busy} />}
              {financeView === 'accounts' && <BankAccounts records={list} open={open} />}
              {financeView === 'travel' && <TravelLog records={list} day={day} open={open} />}
              {financeView === 'sars' && <TaxLog records={list} day={day} open={open} downloadDocument={downloadDocument} />}
            </>}
            {area === 'family' && <Family records={list} open={open} />}
            {area === 'house' && <HouseLists records={list} day={day} open={open} save={save} busy={busy} />}
            {area === 'mornay' && <button className="quiet" onClick={() => navigate('emergency')}>Open emergency card</button>}
            {(area === 'mornay' || area === 'family' || list.some(item => item.kind === 'medication' && item.area === area)) && <Medication records={list} day={day} area={area} open={open} save={save} busy={busy} />}
            {area === 'goals' && <button className="secondary" onClick={() => navigate('goals')}>Goals and habits</button>}
            <section className="feature-section"><h2>Items in this area</h2><ul>{list.filter(item => item.area === area && !item.suggested && !item.dismissed &&
              ['task', 'event', 'note', 'journal', 'document', 'goal', 'habit'].includes(item.kind)).map(renderRow)}</ul></section>
          </> : <>
            <ul>{areaList.map(item => <li className="row" key={item.id}><button className="row-detail" onClick={() => showArea(item.id)}><span>{item.title}<small>{areaStatus(item)}</small></span><ArrowRight size={18} /></button></li>)}</ul>
            <section className="feature-section"><h2>Browse by type</h2><div className="section-actions"><button className="secondary" onClick={() => navigate('emergency')}>Emergency</button><button className="secondary" onClick={() => navigate('records')}>Notes, journal and files</button><button className="secondary" onClick={() => navigate('goals')}>Goals and habits</button><button className="secondary" onClick={() => navigate('review')}>Weekly review</button></div></section>
          </>}
        </div>}
        {view === 'goals' && <div className="screen inside"><h1>Goals and habits</h1>
          <section className="feature-section"><h2>Milestones</h2><ul>{list.filter(item => item.kind === 'goal').map(renderRow)}</ul><button className="secondary" onClick={() => open({ kind: 'goal', area: 'goals' })}>Add goal</button></section>
          <section className="feature-section"><h2>Daily habits</h2><ul>{habits.map(renderRow)}</ul><button className="secondary" onClick={() => open({ kind: 'habit', area: 'mornay' })}>Add habit</button></section>
        </div>}
        {view === 'review' && <div className="screen inside"><h1>Weekly review</h1><p className="muted">{prettyDate(start)} to {prettyDate(weekEnd)}</p>
          <p>{closedThisWeek} tasks completed · {habitsThisWeek} habit check-ins</p>
          {review && <p className="review-note">{review.detail}</p>}
          <button className="primary" onClick={() => open(review || { id: 'review:' + start, kind: 'review', day: start })}>{review ? 'Edit weekly review' : 'Write weekly review'} <ArrowRight size={20} /></button>
          <section className="feature-section"><h2>Past reviews</h2><ul>{list.filter(item => item.kind === 'review' && item.day !== start).sort((a, b) => b.day.localeCompare(a.day)).map(item => <li key={item.id} className="row"><button className="row-detail" onClick={() => open(item)}>Week of {prettyDate(item.day)} <ArrowRight size={18} /></button></li>)}</ul></section>
        </div>}
      </>}
    </main>
    <nav className="nav" aria-label="Main navigation">{tabs.map(([id, label, Icon]) => <button key={id} aria-current={navView === id ? 'page' : undefined} onClick={() => navigate(id)}>{id === 'today' ? <RibbonMark className="nav-ribbon" /> : <Icon size={24} weight="bold" />}{label}</button>)}</nav>
    {editDialog}
    {focus && <Dialog title="Today’s priority" close={() => { setFocus(null); setError(''); }} busy={busy}>
      <h3>{focus.title}</h3><p className="muted">{focus.minutes ? time(focus.minutes) + ' planned' : 'Ready when you are.'}</p>
      {error && <p role="alert">{error}</p>}
      <button className="primary" disabled={busy} onClick={async () => { if (await complete(focus)) setFocus(null); }}>Mark complete <Check size={20} /></button>
      <button className="quiet" disabled={busy} onClick={() => { setFocus(null); open(focus); }}>Edit or reschedule</button>
    </Dialog>}
    {choosing && <Dialog title="Choose today’s priority" close={() => { setChoosing(false); setError(''); }} busy={busy}>
      {error && <p role="alert">{error}</p>}
      <ul>{candidates.map(item => <li key={item.id} className="row"><button className="row-detail" disabled={busy} onClick={() => choosePriority(item)}><span>{item.title}<small>{areaName(item.area)}</small></span><ArrowRight size={18} /></button></li>)}</ul>
    </Dialog>}
  </div>;
}

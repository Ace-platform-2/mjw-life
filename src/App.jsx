import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarBlank, ChartBar, Check, Crosshair, Plus, SquaresFour } from '@phosphor-icons/react';
import { areas, dailyPlan, dateKey, money, prettyDate, shiftDay, weekStart } from './model.js';
import { demo, loadRecords, supabase, writeRecord } from './store.js';

const tabs = [
  ['today', 'Today', CalendarBlank], ['areas', 'Areas', SquaresFour],
  ['goals', 'Goals', Crosshair], ['review', 'Review', ChartBar],
];
const time = minutes => minutes < 60 ? minutes + ' min' : Math.floor(minutes / 60) + 'h' + (minutes % 60 ? ' ' + minutes % 60 + 'm' : '');
const cents = value => Math.round(Number(value) * 100);

export function App() {
  const [session, setSession] = useState(undefined);
  const [membership, setMembership] = useState(null);
  const [authError, setAuthError] = useState('');
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
    supabase.from('life_workspace_members').select('user_id').eq('user_id', userId).maybeSingle()
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
    try {
      const { error } = await supabase.auth.signInWithPassword({ email: form.get('email'), password: form.get('password') });
      if (error) throw error;
    } catch {
      setAuthError('Sign-in failed. Check your account details and try again.');
    } finally {
      setSigningIn(false);
    }
  }

  if (demo || (userId && membership?.userId === userId && membership.allowed)) return <Workspace key={session?.user.id || 'demo'} session={session} />;
  return <div className="gate"><Brand /><main>
    <h1>Private workspace</h1>
    {!supabase ? <p>This deployment needs a Supabase connection.</p>
      : session === undefined || (session && membership?.userId !== userId) ? <p>Checking your access…</p>
      : session ? <><p>{membership.failed ? 'Could not verify workspace access.' : 'This account has not been enrolled.'}</p><button className="quiet" onClick={() => supabase.auth.signOut()}>Sign out</button></>
      : <form onSubmit={signIn}>
        <label>Email<input name="email" type="email" autoComplete="username" required /></label>
        <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
        <button className="primary" disabled={signingIn}>{signingIn ? 'Signing in…' : 'Sign in'}</button>
        {authError && <p role="alert">{authError}</p>}
      </form>}
  </main></div>;
}

function Brand() {
  return <div><div className="brand">MJW <span>LIFE</span></div><div className="subtitle">Command Deck</div></div>;
}

function Workspace({ session }) {
  const [records, setRecords] = useState(null);
  const [view, setView] = useState('today');
  const [area, setArea] = useState(null);
  const [editor, setEditor] = useState(null);
  const [focus, setFocus] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);
  const [day, setDay] = useState(dateKey);
  const [guidance, setGuidance] = useState('');
  const [aiBusy, setAiBusy] = useState(false);
  const [purchase, setPurchase] = useState('');
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

  async function save(record, remove = false) {
    if (lock.current || !records) return false;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      setRecords(await writeRecord(userId, records, record, remove));
      setGuidance('');
      return true;
    } catch {
      setError('The change could not be saved. Try again.');
      return false;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  function navigate(tab) {
    setView(tab);
    setArea(null);
    window.scrollTo(0, 0);
  }

  const list = records || [];
  const areaList = [...areas.map(item => list.find(record => record.id === item.id && record.kind === 'area') || item),
    ...list.filter(item => item.kind === 'area' && !areas.some(base => base.id === item.id))];
  const currentArea = areaList.find(item => item.id === area);
  const areaName = id => areaList.find(item => item.id === id)?.title || 'Unassigned';
  const capacity = list.find(item => item.id === 'capacity:' + day) ||
    { id: 'capacity:' + day, kind: 'capacity', minutes: 180, essentials: false };
  const { today, planned, waiting } = dailyPlan(list, day, capacity.essentials);
  const priority = today[0];
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
  const balance = list.find(item => item.id === 'balance');
  const bills = list.filter(item => item.kind === 'bill' && !item.paid && item.due <= shiftDay(day, 30));
  const commitments = bills.reduce((sum, item) => sum + item.amount, 0);
  const remaining = balance ? balance.amount - commitments : null;
  const nextUp = [...(!capacity.essentials ? habits.filter(item => !checked(item.id)).slice(0, 1) : []), ...today.slice(1)].slice(0, 4);
  const complete = item => save({ ...item, status: 'done', completed: day });

  async function askGuidance() {
    setAiBusy(true);
    setGuidance('');
    try {
      const response = await fetch('/api/guidance', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ available: capacity.minutes, planned, due: today.filter(item => item.due && item.due <= day).length, waiting: waiting.length }),
      });
      const result = await response.json();
      setGuidance(response.ok ? result.text : result.error || 'AI guidance is unavailable.');
    } catch {
      setGuidance('AI guidance is unavailable.');
    } finally {
      setAiBusy(false);
    }
  }

  function renderRow(item) {
    const action = item.kind === 'habit' ? () => toggleHabit(item.id)
      : item.kind === 'task' && !item.completed ? () => complete(item) : null;
    const done = item.kind === 'habit' ? checked(item.id) : Boolean(item.completed);
    const meta = item.kind === 'goal' ? item.progress + ' of ' + item.target + ' milestones'
      : item.kind === 'bill' ? money(item.amount) + ' · ' + (item.paid ? 'Paid' : prettyDate(item.due))
      : item.kind === 'task' ? [item.owner, item.due && prettyDate(item.due), ({ waiting: 'Waiting', escalated: 'Escalated', done: 'Done' })[item.status]].filter(Boolean).join(' · ') : '';
    return <li className="row" key={item.id}>
      {action && <button type="button" className="checkbox" aria-label={(done ? 'Undo ' : 'Complete ') + item.title} aria-pressed={done} disabled={busy} onClick={action}>{done && <Check weight="bold" />}</button>}
      <button className="row-detail" onClick={() => setEditor(item)}><span>{item.title}{meta && <small>{meta}</small>}</span><ArrowRight size={18} /></button>
    </li>;
  }

  return <div className="shell">
    <header className="header"><Brand /><div className="header-actions">
      {demo ? <span className="demo">Sample data</span> : <button className="quiet" onClick={async () => {
        const { error } = await supabase.auth.signOut();
        if (error) setError('Sign-out failed. Try again.');
      }}>Sign out</button>}
      <button className="add" aria-label="Quick capture" disabled={!records} onClick={() => setEditor({ kind: 'task', area: area || 'mornay' })}><Plus size={29} weight="bold" /></button>
    </div></header>
    <main id="main">
      {!records ? <div className="screen"><p role="status">{error || 'Loading your workspace…'}</p>{error && <button className="secondary" onClick={() => { setError(''); setReload(reload + 1); }}>Try again</button>}</div> : <>
        {error && !editor && !focus && <p className="notice" role="alert">{error}</p>}
        {view === 'today' && <div className="today-grid screen">
          <section className="main-deck">
            <p className="eyebrow">{prettyDate(day)}</p>
            <h1>Today’s focus</h1>
            {priority ? <><div className="focus-task">
              <h2>{priority.title}</h2>
              <p>{[priority.due === day ? 'Due today' : priority.due && (priority.due < day ? 'Overdue' : 'Due ' + prettyDate(priority.due)), priority.minutes > 0 && time(priority.minutes)].filter(Boolean).join(' · ') || areaName(priority.area)}</p>
            </div><button className="primary" onClick={() => setFocus(priority)}>Start focus <ArrowRight size={22} weight="bold" /></button></>
              : <div className="empty"><strong>Your focus is clear.</strong><p>{capacity.essentials ? 'No essentials need your attention right now.' : 'Add a task or plan an existing one for today.'}</p><button className="secondary" onClick={() => setEditor({ kind: 'task', area: 'mornay' })}>Add task</button></div>}
            <div className="workload">
              <button className="workload-label" aria-label="Edit daily capacity" onClick={() => setEditor(capacity)}><span><strong>{time(planned)}</strong> planned / {time(capacity.minutes)} available</span><span className="small-link">Edit</span></button>
              <progress aria-label="Daily workload" className={planned > capacity.minutes ? 'over' : ''} max={Math.max(1, capacity.minutes)} value={Math.min(planned, Math.max(1, capacity.minutes))} />
              {planned > capacity.minutes && <p className="warning">{time(planned - capacity.minutes)} over capacity</p>}
              {capacity.essentials && <p className="muted">Essentials only is on.</p>}
            </div>
            <section className="next"><h2>Next up</h2>{nextUp.length ? <ul>{nextUp.map(renderRow)}</ul> : <p className="muted">Nothing else queued.</p>}</section>
          </section>
          <aside className="side-deck">
            <section><h2>Waiting on others</h2>{waiting.length ? <ul>{waiting.map(renderRow)}</ul> : <p className="muted">No outstanding follow-ups.</p>}</section>
            <section><h2>Guidance</h2><p>{planned > capacity.minutes ? 'Open a planned task to move it or mark it as waiting.' : 'Keep some time free before taking on more.'}</p>
              {!demo && <><button className="secondary" onClick={askGuidance} disabled={aiBusy}>{aiBusy ? 'Getting guidance…' : 'Ask AI'}</button><small>Shares counts and time estimates only.</small></>}
              {guidance && <p role="status">{guidance}</p>}
            </section>
          </aside>
        </div>}
        {view === 'areas' && <div className="screen inside">
          <p className="eyebrow">Your workspace</p><h1>{currentArea?.title || 'Life areas'}</h1>
          {currentArea ? <>
            <div className="section-actions"><button className="quiet" onClick={() => setArea(null)}>All areas</button><button className="quiet" onClick={() => setEditor(currentArea)}>Edit area</button></div>
            <p className="muted">{currentArea.detail}</p>
            {currentArea.id === 'finance' && <section className="finance">
              <h2>Cash after commitments</h2>
              <p className={remaining < 0 ? 'warning' : ''}>{remaining === null ? 'Enter your available balance' : money(remaining)}</p>
              <small>{money(commitments)} in unpaid bills due within 30 days or overdue.{balance && ' Balance updated ' + prettyDate(balance.day) + '.'}</small>
              <div className="section-actions"><button className="secondary" onClick={() => setEditor(balance || { id: 'balance', kind: 'balance' })}>Update balance</button><button className="secondary" onClick={() => setEditor({ kind: 'bill', area })}>Add bill</button></div>
              {balance && <label>Check a purchase (R)<input type="number" min="0" max="1000000000" step="0.01" value={purchase} onChange={event => setPurchase(event.target.value)} />{purchase !== '' && Number(purchase) >= 0 && <strong>{money(remaining - cents(purchase))} left after purchase</strong>}</label>}
            </section>}
            <ul>{list.filter(item => item.area === area).map(renderRow)}</ul>
            <button className="secondary" onClick={() => setEditor({ kind: 'task', area })}>Add to {currentArea.title}</button>
          </> : <><ul>{areaList.map(item => <li className="row" key={item.id}><button className="row-detail" onClick={() => setArea(item.id)}><span>{item.title}<small>{item.detail}</small></span><ArrowRight size={18} /></button></li>)}</ul><button className="secondary" onClick={() => setEditor({ kind: 'area' })}>Add area</button></>}
        </div>}
        {view === 'goals' && <div className="screen inside"><p className="eyebrow">Progress</p><h1>Goals &amp; habits</h1>
          <section><h2>Milestones</h2><ul>{list.filter(item => item.kind === 'goal').map(renderRow)}</ul><button className="secondary" onClick={() => setEditor({ kind: 'goal', area: 'goals' })}>Add goal</button></section>
          <section><h2>Daily habits</h2><ul>{habits.map(renderRow)}</ul><button className="secondary" onClick={() => setEditor({ kind: 'habit', area: 'mornay' })}>Add habit</button></section>
        </div>}
        {view === 'review' && <div className="screen inside"><p className="eyebrow">{prettyDate(start)} to {prettyDate(weekEnd)}</p><h1>Weekly review</h1>
          <p>{closedThisWeek} tasks completed · {habitsThisWeek} habit check-ins</p>
          <p className="muted">{list.filter(item => item.kind === 'task' && !item.completed && item.due && item.due < day).length} overdue · {waiting.length} waiting on others</p>
          {review && <p className="review-note">{review.detail}</p>}
          <button className="primary" onClick={() => setEditor(review || { id: 'review:' + start, kind: 'review', day: start })}>{review ? 'Edit weekly review' : 'Start weekly review'} <ArrowRight size={20} /></button>
          <section><h2>Past reviews</h2><ul>{list.filter(item => item.kind === 'review' && item.day !== start).sort((a, b) => b.day.localeCompare(a.day)).map(item => <li key={item.id} className="row"><button className="row-detail" onClick={() => setEditor(item)}>Week of {prettyDate(item.day)} <ArrowRight size={18} /></button></li>)}</ul></section>
        </div>}
      </>}
    </main>
    <nav className="nav" aria-label="Main navigation">{tabs.map(([id, label, Icon]) => <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={25} weight="bold" />{label}</button>)}</nav>
    {editor && <Editor key={editor.id || 'new'} item={editor} day={day} areas={areaList} busy={busy} error={error} close={() => { setEditor(null); setError(''); }} save={save} />}
    {focus && <Dialog title="Focus session" close={() => { setFocus(null); setError(''); }} busy={busy}>
      <h3>{focus.title}</h3><p className="muted">{focus.minutes ? time(focus.minutes) + ' planned' : 'Take the next step when you’re ready.'}</p>
      {error && <p role="alert">{error}</p>}
      <button className="primary" disabled={busy} onClick={async () => { if (await complete(focus)) setFocus(null); }}>Mark complete <Check size={20} /></button>
      <button className="quiet" disabled={busy} onClick={() => { setFocus(null); setEditor(focus); }}>Edit or reschedule</button>
    </Dialog>}
  </div>;
}

function Dialog({ title, close, busy, children }) {
  const dialog = useRef(null);
  useEffect(() => { dialog.current.showModal(); }, []);
  return <dialog ref={dialog} onCancel={event => { event.preventDefault(); if (!busy) close(); }} aria-labelledby="dialog-title">
    <div className="dialog-header"><h2 id="dialog-title">{title}</h2><button className="quiet" type="button" disabled={busy} onClick={close}>Close</button></div>
    {children}
  </dialog>;
}

function Editor({ item, day, areas, busy, error, close, save }) {
  const [kind, setKind] = useState(item.kind);
  const [validation, setValidation] = useState('');
  const title = ({ capacity: 'Daily capacity', review: 'Weekly reflection', balance: 'Available balance' })[kind] || (item.id ? 'Edit ' + kind : 'Quick capture');
  async function submit(event) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    const get = name => String(fields.get(name) ?? '').trim();
    setValidation('');
    const record = { id: item.id || crypto.randomUUID(), kind };
    if (['task', 'goal', 'habit', 'bill', 'area'].includes(kind)) {
      record.title = get('title');
      if (!record.title) return setValidation('Enter a title.');
    }
    if (['task', 'goal', 'habit', 'bill'].includes(kind)) record.area = get('area');
    if (kind === 'task') {
      Object.assign(record, { due: get('due'), planned: get('planned'), minutes: Number(get('minutes')), owner: get('owner'), status: get('status'), essential: fields.has('essential') });
      if (record.status === 'done') record.completed = item.completed || day;
    }
    if (kind === 'goal') {
      Object.assign(record, { progress: Number(get('progress')), target: Number(get('target')) });
      if (record.progress > record.target) return setValidation('Completed milestones cannot exceed the target.');
    }
    if (kind === 'capacity') Object.assign(record, { minutes: Number(get('minutes')), essentials: fields.has('essentials') });
    if (kind === 'area' || kind === 'review') record.detail = get('detail');
    if (kind === 'review') record.day = item.day;
    if (kind === 'balance' || kind === 'bill') record.amount = cents(get('amount'));
    if (kind === 'balance') record.day = day;
    if (kind === 'bill') Object.assign(record, { due: get('due'), paid: fields.has('paid') });
    if (await save(record)) close();
  }
  return <Dialog title={title} close={close} busy={busy}>
    <form onSubmit={submit} key={kind}>
      {!item.id && ['task', 'goal', 'habit', 'bill'].includes(kind) && <label>Type<select value={kind} onChange={event => setKind(event.target.value)}><option value="task">Task</option><option value="goal">Goal</option><option value="habit">Habit</option><option value="bill">Bill</option></select></label>}
      {['task', 'goal', 'habit', 'bill', 'area'].includes(kind) && <label>Title<input name="title" defaultValue={item.title} required maxLength={140} /></label>}
      {['task', 'goal', 'habit', 'bill'].includes(kind) && <label>Area<select name="area" defaultValue={kind === 'bill' ? 'finance' : item.area || 'mornay'}>{areas.map(area => <option key={area.id} value={area.id}>{area.title}</option>)}</select></label>}
      {(kind === 'task' || kind === 'bill') && <label>Due date<input type="date" name="due" required={kind === 'bill'} defaultValue={item.due} /></label>}
      {kind === 'task' && <>
        <label>Plan for<input type="date" name="planned" defaultValue={item.id ? item.planned : day} /></label>
        <label>Owner<input name="owner" placeholder="Me" maxLength={100} defaultValue={item.owner} /></label>
        <label>Status<select name="status" defaultValue={item.status || 'open'}><option value="open">Open</option><option value="waiting">Waiting on someone</option><option value="escalated">Escalated</option><option value="done">Done</option></select></label>
        <label className="tick"><input type="checkbox" name="essential" defaultChecked={item.essential} /> Essential</label>
      </>}
      {(kind === 'task' || kind === 'capacity') && <label>{kind === 'task' ? 'Estimated minutes' : 'Available minutes'}<input type="number" name="minutes" min="0" max="1440" defaultValue={item.minutes ?? 0} required /></label>}
      {kind === 'capacity' && <label className="tick"><input type="checkbox" name="essentials" defaultChecked={item.essentials} /> Show essentials only today</label>}
      {kind === 'goal' && <><label>Milestone target<input type="number" name="target" min="1" max="1000" defaultValue={item.target ?? 3} required /></label><label>Completed milestones<input type="number" name="progress" min="0" max="1000" defaultValue={item.progress ?? 0} required /></label></>}
      {(kind === 'area' || kind === 'review') && <label>{kind === 'review' ? 'What worked, what slipped and what will you change?' : 'Description'}<textarea name="detail" defaultValue={item.detail} maxLength={5000} rows="4" required={kind === 'review'} /></label>}
      {(kind === 'bill' || kind === 'balance') && <label>Amount (R)<input type="number" name="amount" min={kind === 'bill' ? '0' : '-1000000000'} max="1000000000" step="0.01" defaultValue={item.amount === undefined ? '' : item.amount / 100} required /></label>}
      {kind === 'bill' && <label className="tick"><input type="checkbox" name="paid" defaultChecked={item.paid} /> Paid</label>}
      {(error || validation) && <p role="alert" className="warning">{validation || error}</p>}
      <button className="primary" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      {item.id && ['task', 'goal', 'habit', 'bill'].includes(kind) && <button type="button" className="quiet" disabled={busy} onClick={async () => {
        if (window.confirm('Delete this ' + kind + '?') && await save(item, true)) close();
      }}>Delete {kind}</button>}
    </form>
  </Dialog>;
}

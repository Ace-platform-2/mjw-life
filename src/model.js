import { actionSignals } from './action-control.js';
export const areas = [
  ['mornay', 'Mornay', 'Health, habits, rest and personal admin'],
  ['family', 'My Family', 'Family care, relationships and time together'],
  ['fpg', 'FPG', 'Properties, deadlines and follow-ups'],
  ['goals', 'Life Goals', 'Personal milestones, Vorexa and MJW'],
  ['house', 'House', 'Shopping, pets, insurance, garden and maintenance'],
  ['finance', 'Finance', 'Bills, commitments and spending decisions'],
].map(([id, title, detail]) => ({ id, kind: 'area', title, detail }));

const dateFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit',
});
export const dateKey = (date = new Date()) => dateFormat.format(date);
export const shiftDay = (key, days) => {
  const date = new Date(key + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return dateKey(date);
};
export const weekStart = key => shiftDay(key, -((new Date(key + 'T12:00:00Z').getUTCDay() + 6) % 7));
export const prettyDate = key => new Intl.DateTimeFormat('en-ZA', {
  weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg',
}).format(new Date(key + 'T12:00:00Z'));

export const money = cents => new Intl.NumberFormat('en-ZA', {
  style: 'currency', currency: 'ZAR',
}).format(cents / 100);

export function sample(day) {
  return [
    { id: 'demo-budget', kind: 'task', area: 'fpg', title: 'Finish the budget review', due: day, planned: day, minutes: 60, essential: true, status: 'open' },
    { id: 'demo-plan', kind: 'task', area: 'mornay', title: 'Plan next week', due: shiftDay(day, 1), planned: day, minutes: 60, status: 'open' },
    { id: 'demo-walk', kind: 'habit', area: 'mornay', title: 'Log a walk' },
    { id: 'demo-goal', kind: 'goal', area: 'goals', title: 'Finish a first draft', progress: 1, target: 3 },
    { id: 'demo-followup', kind: 'task', area: 'family', title: 'Confirm weekend plans', owner: 'Family', due: shiftDay(day, 1), status: 'waiting' },
  ];
}

export function dailyPlan(records, day, essentialsOnly) {
  const tasks = records.filter(item => item.kind === 'task' && !item.suggested && !item.startsAt && !item.calendarOnly);
  const dueSoon = item => item.due && item.due <= day;
  const open = tasks.filter(item => (item.status === 'open' || item.status === 'escalated') && !item.completed);
  const planned = open.filter(item => item.planned === day).reduce((total, item) => total + (item.minutes || 0), 0);
  const today = open.filter(item => (item.planned === day || dueSoon(item)) && (!essentialsOnly || item.essential || item.status === 'escalated'))
    .sort((a, b) => (actionSignals(b, day)?.score || 0) - (actionSignals(a, day)?.score || 0) ||
      (a.due || '9999').localeCompare(b.due || '9999'));
  const waiting = tasks.filter(item => item.status === 'waiting');
  return { today, planned, waiting };
}

export function riskSignals(records, day, available, planned) {
  const tasks = records.filter(item => item.kind === 'task' && !item.suggested && !item.completed && item.status !== 'done' && !item.startsAt && !item.calendarOnly);
  const overdue = tasks.filter(item => item.due && item.due < day);
  const unplanned = tasks.filter(item => item.due >= day && item.due <= shiftDay(day, 2) && (!item.planned || item.planned > item.due));
  const events = records.filter(item => !item.suggested && !item.completed && item.startsAt && item.endsAt && item.planned >= day && item.planned <= shiftDay(day, 7));
  const followups = tasks.filter(item => item.status === 'waiting' && item.followup && item.followup <= day);
  let clash;
  for (const [index, item] of events.entries()) {
    const other = events.slice(index + 1).find(candidate => Date.parse(item.startsAt) < Date.parse(candidate.endsAt) && Date.parse(candidate.startsAt) < Date.parse(item.endsAt));
    if (other) { clash = [item, other]; break; }
  }
  return [
    ...(overdue.length ? [{ title: overdue.length + ' overdue', detail: 'Review what needs a new date or an escalation.', item: overdue[0] }] : []),
    ...(unplanned.length ? [{ title: unplanned.length + ' due soon without time set before the deadline', detail: 'Make room now while there’s still time.', item: unplanned[0] }] : []),
    ...(followups.length ? [{ title: 'Follow-up due', detail: followups[0].title, item: followups[0] }] : []),
    ...(clash ? [{ title: 'Two events overlap', detail: clash.map(item => item.title).join(' / '), day: clash[0].planned }] : []),
    ...(available !== null && planned > available ? [{ title: 'Today is over capacity', detail: 'Move a task or adjust the time available.' }] : []),
  ];
}

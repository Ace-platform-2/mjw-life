export const areas = [
  ['mornay', 'Mornay', 'Health, habits, rest and personal admin'],
  ['family', 'My Family', 'Family care, relationships and time together'],
  ['fpg', 'FPG', 'Deadlines, decisions and follow-ups'],
  ['goals', 'Life Goals', 'Personal milestones, Vorexa and MJW'],
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
  const tasks = records.filter(item => item.kind === 'task');
  const dueSoon = item => item.due && item.due <= shiftDay(day, 1);
  const open = tasks.filter(item => (item.status === 'open' || item.status === 'escalated') && !item.completed);
  const planned = open.filter(item => item.planned === day).reduce((total, item) => total + (item.minutes || 0), 0);
  const today = open.filter(item => (item.planned === day || dueSoon(item)) && (!essentialsOnly || item.essential || item.status === 'escalated'))
    .sort((a, b) => Number(b.essential || b.status === 'escalated') - Number(a.essential || a.status === 'escalated') || (a.due || '9999').localeCompare(b.due || '9999'));
  const waiting = tasks.filter(item => item.status === 'waiting');
  return { today, planned, waiting };
}

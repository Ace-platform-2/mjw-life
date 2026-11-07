// Deterministic, read-only operational review of MJW Life records.
// No outside data is inferred and no record is changed by this module.
const validDay = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
const dayMs = value => validDay(value) ? Date.parse(value + 'T12:00:00Z') : NaN;
export const daysBetween = (from, to) => {
  const a = dayMs(from), b = dayMs(to);
  return Number.isFinite(a) && Number.isFinite(b) ? Math.round((b - a) / 86400000) : null;
};
export const isOpenProperty = item => Boolean(item && (
  item.kind === 'fpg_log' || item.kind === 'event' && item.propertyType === 'meeting'
) && item.status !== 'closed' && item.status !== 'done' && !item.completed);
export const isOpenTask = item => Boolean(item && item.kind === 'task' && !item.calendarOnly &&
  !item.startsAt && !item.suggested && !item.dismissed && !item.completed &&
  item.status !== 'done' && item.status !== 'closed');
const text = value => String(value || '').trim();

export function actionSignals(item, day) {
  const property = isOpenProperty(item);
  const task = isOpenTask(item);
  if (!property && !task) return null;
  const due = validDay(item.due) ? item.due : '';
  const followup = task && validDay(item.followup) ? item.followup : '';
  const overdueDays = due && due < day ? daysBetween(due, day) : 0;
  const followupDays = followup && followup <= day ? daysBetween(followup, day) : null;
  const escalated = Boolean(item.escalated || item.status === 'escalated');
  const budget = property && item.propertyType === 'budget';
  const missingOwner = property && !text(item.owner);
  const missingNextAction = property && !text(item.nextAction);
  const missingDue = property && !due;
  const dueToday = due === day;
  const dueSoon = Boolean(due && due > day && daysBetween(day, due) <= 2);
  const reasons = [];
  let score = 0;
  if (escalated) { score += 75; reasons.push('Escalated'); }
  if (overdueDays > 0) { score += 40 + Math.min(overdueDays, 20); reasons.push('Overdue ' + overdueDays + 'd'); }
  else if (dueToday) { score += 32; reasons.push('Due today'); }
  else if (dueSoon) { score += 16; reasons.push('Due in ' + daysBetween(day, due) + 'd'); }
  if (followupDays !== null) { score += 34; reasons.push(followupDays ? 'Follow-up overdue ' + followupDays + 'd' : 'Follow-up today'); }
  if (budget) { score += 23; reasons.push('Budget'); }
  if (property && item.propertyType === 'incident') score += 10;
  if (task && item.essential) score += 12;
  if (task && item.planned === day) score += 9;
  if (task && item.status === 'waiting') reasons.push('Waiting on others');
  if (missingOwner) reasons.push('Owner needed');
  if (missingNextAction) reasons.push('Next action needed');
  if (missingDue) reasons.push('Follow-up date needed');
  const priority = escalated || overdueDays > 0 || dueToday || followupDays !== null
    ? 'urgent' : budget || dueSoon || item.essential ? 'review' : 'open';
  return {
    id: item.id, item, isProperty: property, isTask: task, score, priority, reasons,
    escalated, overdueDays, followupDays, budget, missingOwner, missingNextAction,
    missingDue, due, owner: text(item.owner), nextAction: text(item.nextAction),
  };
}

export function controlSummary(records, day, { scope = 'all', buildingId = '' } = {}) {
  const all = records.filter(item => {
    if (scope === 'fpg' && !isOpenProperty(item) && !(isOpenTask(item) && item.area === 'fpg')) return false;
    if (scope === 'personal' && (isOpenProperty(item) || item.area === 'fpg')) return false;
    if (buildingId && item.buildingId !== buildingId) return false;
    return true;
  }).map(item => actionSignals(item, day)).filter(Boolean);
  const attention = all.filter(item => item.priority !== 'open').sort((a, b) =>
    b.score - a.score || (a.due || '9999').localeCompare(b.due || '9999') ||
    (a.item.title || '').localeCompare(b.item.title || ''));
  return {
    all, attention, open: all.length, urgent: all.filter(x => x.priority === 'urgent').length,
    overdue: all.filter(x => x.overdueDays > 0 || x.followupDays > 0).length,
    escalated: all.filter(x => x.escalated).length,
    waiting: all.filter(x => x.item.status === 'waiting').length,
    budgets: all.filter(x => x.budget).length,
    missingOwner: all.filter(x => x.isProperty && x.missingOwner).length,
    missingNextAction: all.filter(x => x.isProperty && x.missingNextAction).length,
    unscheduled: all.filter(x => x.isProperty && x.missingDue).length,
  };
}

// Activity uses the date recorded on the source item. It must never be described
// as a verified email or as a 'newly received' event without a source timestamp.
export function datedActivity(records, from, through, { scope = 'all' } = {}) {
  if (!validDay(from) || !validDay(through) || from > through) return [];
  return records.filter(item => {
    if (scope === 'fpg' && item.area !== 'fpg' && !isOpenProperty(item)) return false;
    if (scope === 'personal' && (item.area === 'fpg' || isOpenProperty(item))) return false;
    const date = text(item.day || item.receivedOn || item.planned || item.createdAt?.slice(0, 10) || item.importedAt?.slice(0, 10));
    return validDay(date) && date >= from && date <= through &&
      !['gmail_sync', 'capacity', 'checkin', 'dose', 'bill_payment'].includes(item.kind);
  }).sort((a,b) => {
    const da = a.day || a.receivedOn || a.planned || a.createdAt || a.importedAt || '';
    const db = b.day || b.receivedOn || b.planned || b.createdAt || b.importedAt || '';
    return db.localeCompare(da) || (a.title || '').localeCompare(b.title || '');
  });
}

export function buildingSnapshot(records, buildingId, day) {
  const scope = controlSummary(records, day, { scope: 'fpg', buildingId });
  const arrears = scope.all.filter(x => x.isProperty && x.item.propertyType === 'arrears');
  const vacancies = scope.all.filter(x => x.isProperty && x.item.propertyType === 'vacancy');
  const knownArrearsCents = arrears.reduce((sum, row) => sum + (Number.isSafeInteger(row.item.amount) ? row.item.amount : 0), 0);
  return { ...scope, arrearsCases: arrears.length, vacancies: vacancies.length,
    knownArrearsCents, arrearsBalanceMissing: arrears.filter(x => !Number.isSafeInteger(x.item.amount)).length };
}

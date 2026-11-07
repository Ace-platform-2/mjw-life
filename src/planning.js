import { dateKey, shiftDay } from './model.js';

export const isEvent = item => item.kind === 'event' || Boolean(item.startsAt || item.calendarOnly);
export const eventTypes = { appointment: 'Appointment', meeting: 'Meeting', birthday: 'Birthday', event: 'Event' };

export const localTime = value => new Intl.DateTimeFormat('en-ZA', {
  timeZone: 'Africa/Johannesburg', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
}).format(new Date(value));

export function eventOn(item, day) {
  const first = item.planned;
  if (!isEvent(item) || !first || day < first) return null;
  if (!item.repeat) {
    const last = item.endDay || (item.endsAt && dateKey(new Date(Date.parse(item.endsAt) - 1))) || first;
    return day <= last ? item : null;
  }
  if (item.repeat === 'yearly' && day.slice(5) !== first.slice(5)) return null;
  if (item.repeat === 'weekly' && (Date.parse(day) - Date.parse(first)) % (7 * 86400000) !== 0) return null;
  if (item.repeat !== 'yearly' && item.repeat !== 'weekly') return day === first ? item : null;
  if (!item.startsAt || day === first) return item;
  const delta = Date.parse(day) - Date.parse(first);
  return { ...item, startsAt: new Date(Date.parse(item.startsAt) + delta).toISOString(),
    endsAt: new Date(Date.parse(item.endsAt) + delta).toISOString() };
}

export function availability(capacity, events, day) {
  if (!capacity) return null;
  if (!capacity.start || !capacity.end) return Number.isFinite(capacity.minutes) ? capacity.minutes : null;
  const start = Date.parse(day + 'T' + capacity.start + ':00+02:00');
  const end = Date.parse(day + 'T' + capacity.end + ':00+02:00');
  const intervals = events.filter(item => item.startsAt && item.endsAt && !item.provenance?.includes('RSVP pending'))
    .map(item => [Math.max(start, Date.parse(item.startsAt)), Math.min(end, Date.parse(item.endsAt))])
    .filter(([from, to]) => from < to).sort(([a], [b]) => a - b);
  let busy = 0;
  let through = start;
  for (const [from, to] of intervals) {
    busy += Math.max(0, to - Math.max(from, through));
    through = Math.max(through, to);
  }
  return Math.max(0, Math.floor((end - start - busy) / 60000));
}

export function monthShift(month, offset) {
  const d = new Date(month + '-01T12:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + offset);
  return d.toISOString().slice(0, 7);
}

export function monthlyBillDate(bill, month) {
  if (!bill.due || month < bill.due.slice(0, 7)) return '';
  if (!bill.repeat) return bill.due.startsWith(month) ? bill.due : '';
  const [year, index] = month.split('-').map(Number);
  const max = new Date(Date.UTC(year, index, 0)).getUTCDate();
  return month + '-' + String(Math.min(max, Number(bill.due.slice(8)))).padStart(2, '0');
}

export function billOccurrences(records, month) {
  const payments = new Map(records.filter(item => item.kind === 'bill_payment').map(item => [item.id, item]));
  return records.filter(item => item.kind === 'bill').flatMap(bill => {
    const due = monthlyBillDate(bill, month);
    if (!due) return [];
    const paymentId = 'payment:' + bill.id + ':' + due;
    const payment = payments.get(paymentId);
    const paid = Boolean(payment || (bill.paid && due === bill.due));
    return [{ bill, due, paymentId, payment, paid }];
  }).sort((a, b) => a.due.localeCompare(b.due));
}

export function outstandingBills(records, day) {
  const end = shiftDay(day, 30);
  const endMonth = end.slice(0, 7);
  const paymentIds = new Set(records.filter(item => item.kind === 'bill_payment').map(item => item.id));
  const unpaid = [];
  for (const bill of records.filter(item => item.kind === 'bill' && item.due && item.due <= end)) {
    let month = bill.due.slice(0, 7);
    for (;;) {
      const due = monthlyBillDate(bill, month);
      const paymentId = 'payment:' + bill.id + ':' + due;
      if (due && due <= end && !paymentIds.has(paymentId) && !(bill.paid && due === bill.due)) {
        unpaid.push({ bill, due, paid: false, paymentId });
      }
      if (!bill.repeat || month >= endMonth) break;
      month = monthShift(month, 1);
    }
  }
  return unpaid.sort((a, b) => a.due.localeCompare(b.due));
}

export const medicationTimes = (records, day) => records.filter(item => item.kind === 'medication' && item.day <= day &&
  (!item.endedOn || day < item.endedOn))
  .flatMap(med => (med.times || []).map(time => ({ med, time, id: 'dose:' + med.id + ':' + day + ':' + time })))
  .sort((a, b) => a.time.localeCompare(b.time));

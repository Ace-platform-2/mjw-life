import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availability, billOccurrences, eventOn, medicationTimes, outstandingBills } from '../src/planning.js';
import { dailyPlan, riskSignals } from '../src/model.js';
import { eventCalendarFile, spendingCSV } from '../src/files.js';
import transcribe from '../api/transcribe.js';

const day = '2026-11-07';
const meeting = (id, start, end) => ({
  id, kind: 'event', planned: day, startsAt: day + 'T' + start + ':00+02:00', endsAt: day + 'T' + end + ':00+02:00',
});

test('available time subtracts the union of confirmed meetings, with no assumed capacity', () => {
  const events = [meeting('a', '08:30', '09:30'), meeting('b', '09:00', '10:00'),
    { ...meeting('c', '10:00', '11:00'), provenance: 'Calendar · RSVP pending' }];
  assert.equal(availability(null, events, day), null);
  assert.equal(availability({ start: '08:00', end: '12:00' }, events, day), 150);
  assert.equal(availability({ minutes: 90 }, events, day), 90);
});

test('calendar keeps imported timed tasks and can display repeating birthdays', () => {
  assert.equal(eventOn({ ...meeting('a', '08:30', '09:30'), kind: 'task' }, day).id, 'a');
  const birthday = { id: 'birthday', kind: 'event', planned: day, repeat: 'yearly' };
  assert.equal(eventOn(birthday, '2027-11-07'), birthday);
  assert.equal(eventOn(birthday, '2027-11-08'), null);
  const weekly = { ...meeting('a', '08:30', '09:30'), repeat: 'weekly' };
  assert.equal(eventOn(weekly, '2026-11-14').startsAt, '2026-11-14T06:30:00.000Z');
});

test('focus excludes imported events and drafts; risks explain clashes and late plans', () => {
  const event = { ...meeting('a', '09:00', '10:00'), kind: 'task', status: 'open' };
  const task = { id: 'task', kind: 'task', status: 'open', planned: '2026-11-10', due: '2026-11-09', minutes: 40 };
  const draft = { ...task, id: 'draft', planned: day, suggested: true };
  assert.equal(dailyPlan([event, task, draft], day, false).today.length, 0);
  const risks = riskSignals([{ ...event, title: 'First' }, { ...meeting('b', '09:30', '11:00'), title: 'Second' }, task], day, null, 40);
  assert.equal(risks.length, 2);
  assert.ok(risks.some(item => item.day === day && item.detail.includes('Second')));
  assert.ok(risks.some(item => item.item?.id === 'task'));
});

test('monthly bills clamp short months and keep occurrence payments separate', () => {
  const bill = { id: 'bill', kind: 'bill', due: '2026-01-31', repeat: 'monthly', amount: 5000 };
  const feb = billOccurrences([bill], '2026-02')[0];
  assert.equal(feb.due, '2026-02-28');
  const payment = { id: feb.paymentId, kind: 'bill_payment' };
  assert.equal(billOccurrences([bill, payment], '2026-02')[0].paid, true);
  assert.equal(billOccurrences([bill, payment], '2026-03')[0].paid, false);
  const old = { id: 'old', kind: 'bill', due: '2025-12-01' };
  assert.equal(outstandingBills([bill, payment, old], '2026-02-24')[0].bill.id, 'old');
});

test('CSV preview handles quoted names, rejects invalid dates and uses stable ids', async () => {
  const input = 'date,description,category,amount\r\n2026-11-07,"Food, tea",Groceries,22.10\r\n';
  const [row] = await spendingCSV(input);
  assert.equal(row.title, 'Food, tea');
  assert.equal(row.amount, 2210);
  assert.equal((await spendingCSV(input))[0].id, row.id);
  await assert.rejects(spendingCSV(input.replace(day, '2026-11-31')), /row 2/);
});

test('medication end dates stop generating doses and calendar export escapes text', () => {
  const med = { id: 'med', kind: 'medication', day, times: ['08:00', '20:00'], endedOn: '2026-11-08' };
  assert.equal(medicationTimes([med], day).length, 2);
  assert.equal(medicationTimes([med], '2026-11-08').length, 0);
  const calendar = eventCalendarFile({ id: 'birthday', title: 'Birthday, friend', planned: day, repeat: 'yearly' });
  assert.match(calendar, /RRULE:FREQ=YEARLY/);
  assert.ok(calendar.includes('SUMMARY:Birthday\\, friend'));
});

test('the transcription endpoint rejects unauthenticated requests', async () => {
  const result = {};
  const res = { setHeader() {}, status(code) { result.code = code; return this; }, json(value) { result.value = value; } };
  await transcribe({ method: 'POST', headers: {} }, res);
  assert.equal(result.code, 401);
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { buildingMatches, fpgNumberMatches, isPropertyEntry, matchingPropertyPhone, propertyAttention, propertyPhone, propertyWorkMatches, readFpgNumber, readPropertyRecord, tenantMatches } from '../src/property.js';

const building = { id: 'test-building', title: 'Example Centre', code: 'EX', securityPhone: '021 000 0000' };
const tenant = { id: 'test-tenant', buildingId: building.id, title: 'Example Café', units: ['A-12'],
  aliases: ['Old Café'], contacts: ['Alex Example'], phones: ['021 000 0001', '+27 (0)82 000 0000 (manager)'] };
const fields = (overrides = {}) => new URLSearchParams({ title: 'Test entry', buildingId: building.id, tenantId: tenant.id,
  day: '2026-11-07', status: 'open', ...overrides });

test('property search uses building codes, aliases, units and local or international phone formats', () => {
  assert.equal(buildingMatches(building, 'EX'), true);
  assert.equal(buildingMatches(building, '+27 21 000 0000'), true);
  assert.equal(tenantMatches(tenant, building, 'EX Old Cafe A12'), true);
  assert.equal(tenantMatches(tenant, building, 'Alex Example'), true);
  assert.equal(tenantMatches(tenant, building, '082 000 0000'), true);
  assert.equal(tenantMatches(tenant, building, 'B-13'), false);
  assert.equal(matchingPropertyPhone(tenant.phones, '0820000000'), tenant.phones[1]);
  assert.equal(propertyPhone(tenant.phones[1]), 'tel:+27820000000');
  assert.equal(propertyPhone('javascript:alert(1)'), '');
});

test('a property meeting retains its tenant and work status when saved as a SAST calendar event', () => {
  const meeting = readPropertyRecord({ kind: 'fpg_log', id: 'meeting' },
    fields({ start: '09:30', end: '10:15', owner: 'Alex', due: '2026-11-08', escalated: 'on' }),
    'meeting', [building], [tenant]);
  assert.equal(isPropertyEntry(meeting), true);
  assert.equal(meeting.kind, 'event');
  assert.equal(meeting.planned, '2026-11-07');
  assert.equal(meeting.startsAt, '2026-11-07T09:30:00+02:00');
  assert.equal(meeting.endsAt, '2026-11-07T10:15:00+02:00');
  assert.equal(meeting.tenantId, tenant.id);
  assert.equal(meeting.owner, 'Alex');
  assert.equal(meeting.escalated, true);
  assert.throws(() => readPropertyRecord(meeting, fields({ start: '10:15', end: '09:30' }),
    'meeting', [building], [tenant]), /start and end time/);
});

test('arrears are stored in cents and a tenant can only be linked to their own building', () => {
  const record = { kind: 'fpg_log', id: 'arrears' };
  assert.equal(readPropertyRecord(record, fields({ amount: '1250.75' }), 'arrears', [building], [tenant]).amount, 125075);
  assert.equal(readPropertyRecord(record, fields({ amount: '.5' }), 'arrears', [building], [tenant]).amount, 50);
  assert.throws(() => readPropertyRecord(record, fields({ amount: '-1250.75' }), 'arrears', [building], [tenant]), /balance in rand/);
  assert.throws(() => readPropertyRecord(record, fields({ amount: '1250.75' }), 'arrears', [building],
    [{ ...tenant, buildingId: 'other-building' }]), /tenant at the selected property/);
});

test('property attention includes due follow-ups and escalations and excludes closed work', () => {
  const log = { kind: 'fpg_log', propertyType: 'incident', status: 'open' };
  const items = [
    { ...log, id: 'due', due: '2026-11-07' },
    { ...log, id: 'escalated', escalated: true },
    { ...log, id: 'closed', due: '2026-11-07', escalated: true, status: 'closed' },
    { ...log, id: 'later', due: '2026-11-08' },
  ];
  assert.deepEqual(propertyAttention(items, '2026-11-07').map(item => item.id), ['escalated', 'due']);
});

test('work history retains its tenant name and remains editable after the tenant file is removed', () => {
  const incident = readPropertyRecord({ kind: 'fpg_log', id: 'incident' }, fields(), 'incident', [building], [tenant]);
  const edited = readPropertyRecord(incident, fields({ status: 'closed' }), 'incident', [building], []);
  assert.equal(edited.tenantId, tenant.id);
  assert.equal(edited.tenantName, tenant.title);
  assert.equal(edited.status, 'closed');
  assert.equal(readPropertyRecord(edited, fields({ tenantId: '' }), 'incident', [building], []).tenantName, '');
});

test('FPG numbers can be left blank and searched by category or either phone number', () => {
  const item = { id: 'contact', kind: 'fpg_contact' };
  const values = new URLSearchParams({ title: 'Example Security', category: 'security', alternatePhone: '+27 (0)82 000 0000' });
  const contact = readFpgNumber(item, values);
  assert.equal(contact.phone, '');
  assert.equal(fpgNumberMatches(contact, 'Security'), true);
  assert.equal(fpgNumberMatches(contact, '0820000000'), true);
  assert.equal(fpgNumberMatches(contact, 'Facilities'), false);
  values.set('phone', 'wrong number');
  assert.throws(() => readFpgNumber(item, values), /phone numbers/);
});

test('building registers preserve dated follow-ups and separate unknown balances from zero', () => {
  const arrears = readPropertyRecord({ kind: 'fpg_log', id: 'arrears' },
    fields({ followUpNote: 'Sent payment plan' }), 'arrears', [building], [tenant]);
  assert.equal(arrears.amount, null);
  assert.equal(arrears.followUpNotes[0].text, 'Sent payment plan');
  assert.ok(Number.isFinite(Date.parse(arrears.followUpNotes[0].at)));

  const updated = readPropertyRecord(arrears, fields({ amount: '0', followUpNote: 'Called accounts' }), 'arrears', [building], [tenant]);
  assert.equal(updated.amount, 0);
  assert.deepEqual(updated.followUpNotes.map(note => note.text), ['Sent payment plan', 'Called accounts']);
  assert.deepEqual(readPropertyRecord(updated, fields({ amount: '0' }), 'arrears', [building], [tenant]).followUpNotes, updated.followUpNotes);
  assert.equal(propertyWorkMatches(updated, building, tenant.title, 'cafe accounts'), true);
  assert.equal(propertyWorkMatches(updated, building, tenant.title, 'unrelated unit'), false);
});

test('legacy vacancies remain editable and new vacancy availability is stored', () => {
  const legacy = { id: 'vacancy', kind: 'fpg_log', propertyType: 'vacancy', buildingId: building.id };
  const vacancy = readPropertyRecord(legacy, fields({ vacancyStage: 'under_offer', availableFrom: '2026-12-01',
    floorArea: '125.50', followUpNote: 'Viewing booked' }), 'vacancy', [building], [tenant]);
  assert.equal(vacancy.vacancyStage, 'under_offer');
  assert.equal(vacancy.availableFrom, '2026-12-01');
  assert.equal(vacancy.floorArea, 125.5);
  assert.equal(readPropertyRecord(legacy, fields(), 'vacancy', [building], [tenant]).vacancyStage, '');
});


test('budget stage, period, revision and dated notes remain linked to the building', () => {
  const original = { id: 'budget', kind: 'fpg_log', propertyType: 'budget', buildingId: building.id };
  const draft = readPropertyRecord(original, fields({
    budgetStage: 'assumptions', budgetPeriod: 'FY2027/28', budgetVersion: 'v1',
    owner: 'Property Manager', due: '2026-11-09', nextAction: 'Confirm expiring leases',
    followUpNote: 'Assumptions sent for review',
  }), 'budget', [building], [tenant]);
  assert.equal(draft.buildingId, building.id);
  assert.equal(draft.budgetStage, 'assumptions');
  assert.equal(draft.budgetPeriod, 'FY2027/28');
  assert.equal(draft.budgetVersion, 'v1');
  assert.equal(draft.followUpNotes.length, 1);
  assert.equal(draft.owner, 'Property Manager');
  assert.throws(() => readPropertyRecord(draft, fields({
    budgetStage: 'submitted', submittedOn: '',
  }), 'budget', [building], [tenant]), /date when the budget was submitted/);
  const submitted = readPropertyRecord(draft, fields({
    budgetStage: 'submitted', submittedOn: '2026-11-09', submissionRef: 'Submission email',
    budgetPeriod: 'FY2027/28', budgetVersion: 'v2',
    followUpNote: 'Submission sent',
  }), 'budget', [building], [tenant]);
  assert.equal(submitted.submittedOn, '2026-11-09');
  assert.equal(submitted.submissionRef, 'Submission email');
  assert.deepEqual(submitted.followUpNotes.map(x => x.text),
    ['Assumptions sent for review', 'Submission sent']);
  assert.equal(submitted.status, 'open'); // Submission never silently closes the matter.
  assert.throws(() => readPropertyRecord(draft, fields({ budgetStage: 'not-a-stage' }),
    'budget', [building], [tenant]), /valid budget stage/);
});

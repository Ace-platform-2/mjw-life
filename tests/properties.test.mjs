import assert from 'node:assert/strict';
import test from 'node:test';
import { buildingMatches, isPropertyEntry, matchingPropertyPhone, propertyAttention, propertyPhone, readPropertyRecord, tenantMatches } from '../src/property.js';

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

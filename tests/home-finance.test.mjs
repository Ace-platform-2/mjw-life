import { test } from 'node:test';
import assert from 'node:assert/strict';
import { advanceHouseItem, decryptAccount, encryptAccount, rowsCSV, taxYearStart, tel, travelSummary } from '../src/personal-model.js';
import { collectGmail, gmailKey } from '../src/gmail.js';

test('bank numbers round-trip with leading zeros and fail to unlock with the wrong passphrase', async () => {
  const phrase = 'a long test-only passphrase';
  const entry = await encryptAccount('0012 3456 7890', phrase);
  assert.equal(entry.last4, '7890');
  assert.equal(await decryptAccount(entry.vault, phrase), '001234567890');
  await assert.rejects(decryptAccount(entry.vault, 'different phrase'), /passphrase/);
  assert.doesNotMatch(JSON.stringify(entry), /001234567890/);
});

test('monthly household repeats retain the original day and roll overdue weekly items forward', () => {
  const feb = advanceHouseItem({ due: '2026-01-31', repeat: 'monthly' }, '2026-01-31');
  assert.equal(feb.due, '2026-02-28');
  assert.equal(advanceHouseItem(feb, feb.due).due, '2026-03-31');
  assert.equal(advanceHouseItem({ due: '2026-11-01', repeat: 'weekly' }, '2026-11-13').due, '2026-11-15');
  assert.equal(advanceHouseItem({ completed: '' }, '2026-11-07').completed, '2026-11-07');
});

test('travel costs include fill-ups without double-counting mileage and CSV escapes formula cells', () => {
  const totals = travelSummary([{ travelType: 'trip', use: 'business', km: 100, amount: 3000 },
    { travelType: 'fuel', km: 100, litres: 25, fuel: 12000 }]);
  assert.deepEqual(totals, { km: 100, businessKm: 100, litres: 25, fuel: 12000, total: 15000, costPerKm: 150 });
  assert.equal(travelSummary([{ travelType: 'fuel', fuel: 100 }]).costPerKm, null);
  assert.equal(rowsCSV([['=bad', 'a,"b"']]), '"\'=bad","a,""b"""\r\n');
  assert.equal(taxYearStart('2026-02-28'), '2025-03-01');
  assert.equal(tel('+27 (21) 123-4567'), 'tel:+27211234567');
  assert.equal(tel('javascript:bad'), '');
});

const profile = { emailAddress: 'tester@example.com', historyId: '9007199254740995' };
const date = '2026-11-07T15:00:00Z';
const metadata = { internalDate: '1794063600000', labelIds: ['INBOX'], payload: { headers: [{ name: 'Subject', value: 'New message' }] } };

test('Gmail refresh pages from the exact cursor, deduplicates and stops at the profile snapshot', async () => {
  const account = await gmailKey(profile.emailAddress);
  const calls = [];
  const get = async (path, args) => {
    calls.push(path);
    if (path === '/history') {
      assert.equal(args.get('startHistoryId'), '9007199254740993');
      if (!args.has('pageToken')) return { nextPageToken: 'second', history: [
        { id: '9007199254740994', messagesAdded: [{ message: { id: 'existing' } }, { message: { id: 'new' } }] },
      ] };
      return { history: [
        { id: '9007199254740995', labelsAdded: [{ labelIds: ['INBOX'], message: { id: 'new' } }] },
        { id: '9007199254740996', messagesAdded: [{ message: { id: 'future' } }] },
      ] };
    }
    assert.equal(path, '/messages/new');
    return metadata;
  };
  const { messages, checkpoint } = await collectGmail(get, profile, { historyId: '9007199254740993', checkedAt: date }, 'mornay', date,
    new Set(['gmail:' + account + ':existing']));
  assert.deepEqual(calls, ['/history', '/history', '/messages/new']);
  assert.equal(checkpoint.historyId, profile.historyId);
  assert.equal(messages[0].title, 'New message');
  assert.equal(messages[0].suggested, true);
});

test('Gmail recovers from expired history and leaves a failed scan for retry', async () => {
  const previous = { historyId: '99', checkedAt: '2026-11-07T12:00:00Z' };
  const get = async (path, args) => {
    if (path === '/history') throw Object.assign(new Error('expired'), { status: 404 });
    if (path === '/messages') {
      assert.equal(args.q, 'after:' + (Date.parse(previous.checkedAt) / 1000 - 120));
      return { messages: [{ id: 'later' }] };
    }
    throw Object.assign(new Error('temporary'), { status: 429 });
  };
  await assert.rejects(collectGmail(get, profile, previous, 'mornay', date), /temporary/);
});

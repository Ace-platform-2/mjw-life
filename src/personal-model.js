import { shiftDay } from './model.js';

export const homeCategories = {
  shopping: 'Shopping', insurance: 'Insurance', pets: 'Pet supplies', letwine: 'Letwine',
  garden: 'Garden', maintenance: 'Maintenance', other: 'Other',
};

export const accountTypes = {
  current: 'Current / cheque', savings: 'Savings', credit: 'Credit card account', investment: 'Investment', other: 'Other',
};

export const tel = number => {
  const digits = String(number || '').trim().replace(/[ ()-]/g, '');
  return /^\+?\d{3,16}$/.test(digits) ? 'tel:' + digits : '';
};

const b64 = bytes => btoa(String.fromCharCode(...bytes));
const bytes = value => Uint8Array.from(atob(value), char => char.charCodeAt(0));

async function bankKey(passphrase, salt) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600000 },
    key, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}

export async function encryptAccount(number, passphrase) {
  const account = number.trim().replace(/[ -]/g, '');
  if (!/^\d{4,34}$/.test(account)) throw new Error('Enter a valid account number of 4 to 34 digits.');
  if (passphrase.length < 12) throw new Error('Use a vault passphrase of at least 12 characters.');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await bankKey(passphrase, salt), new TextEncoder().encode(account));
  return { last4: account.slice(-4), vault: { version: 1, salt: b64(salt), iv: b64(iv), cipher: b64(new Uint8Array(cipher)) } };
}

export async function decryptAccount(vault, passphrase) {
  try {
    if (vault.version !== 1) throw new Error();
    const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(vault.iv) },
      await bankKey(passphrase, bytes(vault.salt)), bytes(vault.cipher));
    return new TextDecoder().decode(plaintext);
  } catch { throw new Error('Could not unlock this account number. Check your passphrase.'); }
}

export function advanceHouseItem(item, day) {
  if (!item.repeat || !item.due) return { ...item, completed: item.completed ? '' : day };
  if (item.repeat === 'weekly') {
    const weeks = Math.max(1, Math.floor((Date.parse(day) - Date.parse(item.due)) / 604800000) + 1);
    return { ...item, lastDone: day, due: shiftDay(item.due, 7 * weeks), completed: '' };
  }
  const current = new Date(item.due + 'T12:00:00Z');
  const date = Number(item.repeatDay) || current.getUTCDate();
  current.setUTCDate(1);
  let due;
  do {
    current.setUTCMonth(current.getUTCMonth() + 1);
    const last = new Date(Date.UTC(current.getUTCFullYear(), current.getUTCMonth() + 1, 0)).getUTCDate();
    due = current.toISOString().slice(0, 7) + '-' + String(Math.min(date, last)).padStart(2, '0');
  } while (due <= day);
  return { ...item, lastDone: day, due, repeatDay: date, completed: '' };
}

export function travelSummary(entries) {
  const result = { km: 0, businessKm: 0, litres: 0, fuel: 0, total: 0, costPerKm: null };
  for (const item of entries) {
    if (item.travelType === 'trip') {
      result.km += item.km || 0;
      if (item.use === 'business') result.businessKm += item.km || 0;
    }
    result.litres += item.litres || 0;
    result.fuel += item.fuel || 0;
    result.total += (item.fuel || 0) + (item.amount || 0);
  }
  if (result.km > 0) result.costPerKm = Math.round(result.total / result.km);
  return result;
}

const csvCell = value => {
  const text = String(value ?? '');
  const guarded = /^[\s]*[=+\-@\t\r\n]/.test(text) ? "'" + text : text;
  return '"' + guarded.replace(/"/g, '""') + '"';
};

export const rowsCSV = rows => rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';

export function taxYearStart(day) {
  const year = Number(day.slice(0, 4));
  return (day.slice(5, 7) < '03' ? year - 1 : year) + '-03-01';
}

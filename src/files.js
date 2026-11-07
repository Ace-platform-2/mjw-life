export function downloadFile(contents, filename, type = 'application/json') {
  const url = URL.createObjectURL(contents instanceof Blob ? contents : new Blob([contents], { type }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function readCSV(input) {
  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;
  const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index++; }
      else if (quoted || !field) quoted = !quoted;
      else throw new Error('Check the CSV quotation marks.');
    } else if (!quoted && (char === ',' || char === '\n')) {
      row.push(field.trim());
      field = '';
      if (char === '\n') { if (row.some(Boolean)) rows.push(row); row = []; }
    } else field += char;
  }
  if (quoted) throw new Error('A quoted CSV field did not close.');
  row.push(field.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

export async function spendingCSV(input) {
  const [header, ...rows] = readCSV(input);
  if (header?.map(value => value.toLowerCase()).join(',') !== 'date,description,category,amount') {
    throw new Error('Use the template headers: date, description, category, amount.');
  }
  if (!rows.length || rows.length > 300) throw new Error('Choose a CSV containing 1 to 300 rows.');
  const seen = new Map();
  return Promise.all(rows.map(async ([day, title, category, amount, ...extra], index) => {
    const date = new Date(day + 'T00:00:00Z');
    if (extra.length || !/^\d{4}-\d{2}-\d{2}$/.test(day || '') || Number.isNaN(+date) || date.toISOString().slice(0, 10) !== day ||
        !title || title.length > 180 || category === undefined || category.length > 80 ||
        !/^\d{1,9}(\.\d{1,2})?$/.test(amount || '') || Number(amount) <= 0) {
      throw new Error('Check row ' + (index + 2) + '. Use YYYY-MM-DD and a positive rand amount.');
    }
    const value = Math.round(Number(amount) * 100);
    const key = JSON.stringify([day, title, category, value]);
    const occurrence = (seen.get(key) || 0) + 1;
    seen.set(key, occurrence);
    const bytes = new TextEncoder().encode(key + ':' + occurrence);
    const hash = await crypto.subtle.digest('SHA-256', bytes);
    const id = 'csv:' + [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return { id, kind: 'expense', area: 'finance', title, day, category, amount: value, source: 'CSV' };
  }));
}

export function eventCalendarFile(event) {
  const stamp = date => date.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const ical = text => String(text).replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/[,;]/g, '\\$&');
  const start = event.startsAt ? 'DTSTART:' + stamp(new Date(event.startsAt)) : 'DTSTART;VALUE=DATE:' + event.planned.replace(/-/g, '');
  let end = 'DURATION:P1D';
  if (event.endsAt) end = 'DTEND:' + stamp(new Date(event.endsAt));
  else if (event.endDay && event.endDay > event.planned) {
    const next = new Date(event.endDay + 'T00:00:00Z');
    next.setUTCDate(next.getUTCDate() + 1);
    end = 'DTEND;VALUE=DATE:' + next.toISOString().slice(0, 10).replace(/-/g, '');
  }
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//MJW Life//Personal reminders//EN', 'BEGIN:VEVENT',
    'UID:' + ical(event.id) + '@mjw-life.vercel.app', 'DTSTAMP:' + stamp(new Date()),
    start, end, 'SUMMARY:' + ical(event.title), event.repeat && 'RRULE:FREQ=' + event.repeat.toUpperCase(),
    'BEGIN:VALARM', event.startsAt ? 'TRIGGER:-PT15M' : 'TRIGGER:-P1D', 'ACTION:DISPLAY', 'DESCRIPTION:Calendar reminder',
    'END:VALARM', 'END:VEVENT', 'END:VCALENDAR',
  ].filter(Boolean).join('\r\n') + '\r\n';
}

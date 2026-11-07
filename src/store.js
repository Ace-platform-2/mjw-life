import { createClient } from '@supabase/supabase-js';
import { dateKey, sample } from './model.js';

const { VITE_SUPABASE_URL: url, VITE_SUPABASE_PUBLISHABLE_KEY: key } = import.meta.env;
export const supabase = url && key ? createClient(url, key) : null;
export const demo = !supabase && import.meta.env.DEV;
const demoKey = 'mjw-life-demo-v1';

export async function loadRecords(userId) {
  if (demo) {
    const saved = localStorage.getItem(demoKey);
    return saved ? JSON.parse(saved) : sample(dateKey());
  }
  const records = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('life_records').select('id,kind,data')
      .eq('user_id', userId).order('id').range(offset, offset + 499);
    if (error) throw error;
    records.push(...data.map(({ id, kind, data: record }) => ({ ...record, id, kind })));
    if (data.length < 500) return records;
  }
}

export async function writeRecord(userId, records, record, remove = false) {
  const next = records.filter(item => item.id !== record.id);
  if (!remove) next.push(record);
  if (demo) {
    localStorage.setItem(demoKey, JSON.stringify(next));
    return next;
  }
  const { id, kind, ...data } = record;
  const table = supabase.from('life_records');
  const result = remove
    ? await table.delete().eq('user_id', userId).eq('id', id)
    : await table.upsert({ user_id: userId, id, kind, data });
  if (result.error) throw result.error;
  return next;
}

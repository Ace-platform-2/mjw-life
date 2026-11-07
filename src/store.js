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
  if (!remove) return writeRecords(userId, records, [record]);
  const next = records.filter(item => item.id !== record.id);
  if (demo) {
    localStorage.setItem(demoKey, JSON.stringify(next));
    return next;
  }
  const { error } = await supabase.from('life_records').delete().eq('user_id', userId).eq('id', record.id);
  if (error) throw error;
  return next;
}

export async function writeRecords(userId, records, items) {
  const ids = new Set(items.map(item => item.id));
  const next = [...records.filter(item => !ids.has(item.id)), ...items];
  if (demo) {
    localStorage.setItem(demoKey, JSON.stringify(next));
    return next;
  }
  const { error } = await supabase.from('life_records')
    .upsert(items.map(({ id, kind, ...data }) => ({ user_id: userId, id, kind, data })));
  if (error) throw error;
  return next;
}

export async function insertRecords(userId, records, items) {
  if (demo) {
    const merged = [...records, ...items.filter(item => !records.some(record => record.id === item.id))];
    localStorage.setItem(demoKey, JSON.stringify(merged));
    return merged;
  }
  const { data, error } = await supabase.from('life_records')
    .upsert(items.map(({ id, kind, ...data }) => ({ user_id: userId, id, kind, data })),
      { onConflict: 'user_id,id', ignoreDuplicates: true }).select('id,kind,data');
  if (error) throw error;
  return [...records, ...data.map(({ id, kind, data: record }) => ({ ...record, id, kind }))];
}

const fileTypes = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
  webp: 'image/webp', txt: 'text/plain', csv: 'text/csv',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const documentBucket = () => supabase.storage.from('life-documents');

export async function storeDocument(userId, file) {
  if (demo) throw new Error('File uploads require a signed-in workspace.');
  const extension = file.name.split('.').pop().toLowerCase();
  const contentType = Object.hasOwn(fileTypes, extension) && fileTypes[extension];
  if (!contentType || !file.size || file.size > 10485760) throw new Error('Choose a supported file up to 10 MB.');
  const bytes = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const prefix = (...values) => values.every((value, index) => bytes[index] === value);
  const match = {
    pdf: prefix(37, 80, 68, 70, 45), png: prefix(137, 80, 78, 71),
    jpg: prefix(255, 216, 255), jpeg: prefix(255, 216, 255),
    webp: prefix(82, 73, 70, 70) && bytes[8] === 87 && bytes[9] === 69 && bytes[10] === 66 && bytes[11] === 80,
    docx: prefix(80, 75, 3, 4), xlsx: prefix(80, 75, 3, 4),
    txt: !bytes.includes(0), csv: !bytes.includes(0),
  };
  if (!match[extension]) throw new Error('The file content does not match its extension.');
  const path = userId + '/' + crypto.randomUUID() + '.' + extension;
  const { error } = await documentBucket().upload(path, file, { contentType, upsert: false });
  if (error) throw new Error('The upload failed. Try again.');
  return { path, filename: file.name, size: file.size, contentType };
}

export async function removeDocument(path) {
  const { error } = await documentBucket().remove([path]);
  if (error) throw error;
}

export async function getDocument(path) {
  const { data, error } = await documentBucket().download(path);
  if (error) throw error;
  return data;
}

// Private, device-local audio vault. Audio is never sent to Supabase.
const DATABASE = 'mjw-life-audio-v1';
const VERSION = 1;
let connection;

function openDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('Local audio storage is unavailable in this browser.'));
  if (!connection) connection = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('recordings')) db.createObjectStore('recordings', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('chunks')) {
        const store = db.createObjectStore('chunks', { keyPath: ['recordingId', 'sequence'] });
        store.createIndex('recordingId', 'recordingId', { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open local recording storage.'));
  }).catch(error => { connection = null; throw error; });
  return connection;
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Could not save audio locally.'));
    transaction.onabort = () => reject(transaction.error || new Error('Audio storage was interrupted.'));
  });
}

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function beginRecording({ id, name, mimeType, ownerId }) {
  const db = await openDatabase();
  const tx = db.transaction('recordings', 'readwrite');
  tx.objectStore('recordings').put({
    id, name, mimeType, ownerId, createdAt: new Date().toISOString(),
    status: 'recording', durationSeconds: 0, bytes: 0, chunkCount: 0,
  });
  await transactionDone(tx);
}

export async function appendRecordingChunk(id, sequence, blob) {
  const db = await openDatabase();
  const tx = db.transaction(['recordings', 'chunks'], 'readwrite');
  const recordings = tx.objectStore('recordings');
  tx.objectStore('chunks').put({ recordingId: id, sequence, blob });
  const req = recordings.get(id);
  req.onsuccess = () => {
    if (!req.result) { tx.abort(); return; }
    recordings.put({ ...req.result, bytes: req.result.bytes + blob.size, chunkCount: sequence + 1 });
  };
  await transactionDone(tx);
}

export async function finishRecording(id, durationSeconds) {
  const db = await openDatabase();
  const tx = db.transaction('recordings', 'readwrite');
  const store = tx.objectStore('recordings');
  const req = store.get(id);
  req.onsuccess = () => {
    if (req.result) store.put({ ...req.result, status: 'saved', durationSeconds: Math.round(durationSeconds) });
  };
  await transactionDone(tx);
}

export async function listRecordings(ownerId) {
  const db = await openDatabase();
  const tx = db.transaction('recordings', 'readonly');
  const result = await requestResult(tx.objectStore('recordings').getAll());
  return result.filter(item => item.ownerId === ownerId && item.chunkCount > 0).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadRecording(id, ownerId) {
  const db = await openDatabase();
  const tx = db.transaction(['recordings', 'chunks'], 'readonly');
  const metaRequest = tx.objectStore('recordings').get(id);
  const chunksRequest = tx.objectStore('chunks').index('recordingId').getAll(IDBKeyRange.only(id));
  const [metadata, chunks] = await Promise.all([requestResult(metaRequest), requestResult(chunksRequest)]);
  if (!metadata || metadata.ownerId !== ownerId) throw new Error('This recording is not available for this account.');
  if (!chunks.length) throw new Error('No saved audio was found for this recording.');
  chunks.sort((a, b) => a.sequence - b.sequence);
  return { ...metadata, audio: new Blob(chunks.map(item => item.blob), { type: metadata.mimeType || 'audio/webm' }) };
}

export async function downloadRecording(id, ownerId) {
  const recording = await loadRecording(id, ownerId);
  const url = URL.createObjectURL(recording.audio);
  const link = document.createElement('a');
  link.href = url;
  link.download = recording.name;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  return recording;
}

export async function deleteRecording(id, ownerId) {
  await loadRecording(id, ownerId);
  const db = await openDatabase();
  const tx = db.transaction(['recordings', 'chunks'], 'readwrite');
  tx.objectStore('recordings').delete(id);
  const request = tx.objectStore('chunks').index('recordingId').openKeyCursor(IDBKeyRange.only(id));
  request.onsuccess = () => {
    const cursor = request.result;
    if (cursor) { tx.objectStore('chunks').delete(cursor.primaryKey); cursor.continue(); }
  };
  await transactionDone(tx);
}

export async function persistAudioStorage() {
  if (navigator.storage?.persist) {
    try { await navigator.storage.persist(); } catch { /* Browser may not support persistent storage. */ }
  }
}

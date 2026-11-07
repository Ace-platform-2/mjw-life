import { dateKey } from './model.js';

export const gmailBase = 'https://gmail.googleapis.com/gmail/v1/users/me';

export async function gmailKey(address) {
  const bytes = new TextEncoder().encode(address.trim().toLowerCase());
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)).slice(0, 16)]
    .map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export async function gmailRequest(token, path, parameters = {}) {
  const url = new URL(gmailBase + path);
  url.search = new URLSearchParams(parameters);
  const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(20000) });
  if (!response.ok) {
    const error = new Error(response.status === 401 ? 'Google access expired. Refresh again to reconnect.' : 'Gmail could not complete the request. Try again.');
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function inboxIds(get, since) {
  const ids = new Set();
  let pageToken;
  do {
    const page = await get('/messages', { labelIds: 'INBOX', q: 'after:' + Math.floor(since / 1000), maxResults: '500',
      fields: 'nextPageToken,messages(id)', ...(pageToken ? { pageToken } : {}) });
    for (const item of page.messages || []) ids.add(item.id);
    pageToken = page.nextPageToken;
  } while (pageToken);
  return ids;
}

async function changedIds(get, start, through) {
  const ids = new Set();
  let pageToken;
  do {
    const params = new URLSearchParams({ startHistoryId: start, maxResults: '500',
      fields: 'nextPageToken,history(id,messagesAdded(message(id)),labelsAdded(labelIds,message(id)))' });
    params.append('historyTypes', 'messageAdded');
    params.append('historyTypes', 'labelAdded');
    if (pageToken) params.set('pageToken', pageToken);
    const page = await get('/history', params);
    for (const entry of page.history || []) {
      if (BigInt(entry.id) > BigInt(through)) return ids;
      for (const { message } of entry.messagesAdded || []) ids.add(message.id);
      for (const { message, labelIds } of entry.labelsAdded || []) if (labelIds.includes('INBOX')) ids.add(message.id);
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return ids;
}

export async function collectGmail(get, profile, checkpoint, area, checkedAt, alreadySaved = new Set(), onProgress = () => {}) {
  const key = await gmailKey(profile.emailAddress);
  const through = profile.historyId;
  if (!/^\d+$/.test(through)) throw new Error('Gmail did not return a refresh checkpoint.');
  if (checkpoint?.historyId && BigInt(through) < BigInt(checkpoint.historyId)) throw new Error('A newer refresh is already saved. Refresh again.');
  let ids;
  if (checkpoint?.historyId) {
    try { ids = BigInt(through) === BigInt(checkpoint.historyId) ? new Set() : await changedIds(get, checkpoint.historyId, through); }
    catch (error) { if (error.status !== 404) throw error; }
  }
  if (!ids) {
    const since = checkpoint?.checkedAt ? Date.parse(checkpoint.checkedAt) - 120000 : Date.parse(checkedAt) - 7 * 86400000;
    ids = await inboxIds(get, since);
  }
  const messageIds = [...ids].filter(id => id && !alreadySaved.has('gmail:' + key + ':' + id) && !alreadySaved.has('gmail:' + id));
  const messages = [];
  for (let offset = 0; offset < messageIds.length; offset += 8) {
    const batch = await Promise.all(messageIds.slice(offset, offset + 8).map(async id => {
      try {
        const item = await get('/messages/' + encodeURIComponent(id), {
          format: 'metadata', metadataHeaders: 'Subject', fields: 'id,internalDate,labelIds,payload(headers)',
        });
        if (!item.labelIds?.includes('INBOX') || item.labelIds.some(label => ['TRASH', 'SPAM', 'DRAFT'].includes(label))) return null;
        const subject = item.payload?.headers?.find(header => header.name.toLowerCase() === 'subject')?.value?.trim();
        const sent = Number(item.internalDate);
        return { id: 'gmail:' + key + ':' + id, kind: 'task', area, title: (subject || 'Email follow-up').slice(0, 180),
          suggested: true, status: 'open', source: 'Gmail', provenance: 'Gmail · follow-up draft',
          ...(sent > 0 ? { receivedOn: dateKey(new Date(sent)) } : {}), importedAt: checkedAt };
      } catch (error) {
        if (error.status === 404) return null;
        throw error;
      }
    }));
    messages.push(...batch.filter(Boolean));
    onProgress(Math.min(offset + 8, messageIds.length), messageIds.length);
  }
  return { messages, checkpoint: { historyId: through, checkedAt, runId: crypto.randomUUID(), mailbox: profile.emailAddress } };
}

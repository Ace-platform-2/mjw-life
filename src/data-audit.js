// Local-only archive inventory. Exported JSON never contains the encrypted bank vault;
// attachments and device audio require separate backups.
const isWork = item => item?.area === 'fpg' ||
  /^fpg_/.test(String(item?.kind || '')) || item?.propertyType && item?.buildingId;
const safeObject = value => value && typeof value === 'object' && !Array.isArray(value);

export function safeRecord(record) {
  if (!safeObject(record)) return null;
  const { vault, ...clean } = record;
  // Never export the encrypted bank vault, nor any future field with this name.
  return typeof clean.id === 'string' && typeof clean.kind === 'string' ? clean : null;
}

export function archiveReport(records, { includeWork = false } = {}) {
  const valid = (Array.isArray(records) ? records : []).filter(safeObject);
  const included = valid.filter(row => includeWork || !isWork(row));
  const attachments = new Map();
  function add(path, filename, kind) {
    if (typeof path !== 'string' || !path.trim() || attachments.has(path)) return;
    attachments.set(path, { path, filename: String(filename || 'Attachment'), kind });
  }
  for (const record of included) {
    if (record.path) add(record.path, record.filename, record.kind);
    for (const photo of Array.isArray(record.photos) ? record.photos : []) {
      if (safeObject(photo)) add(photo.path, photo.filename, 'photo');
    }
  }
  const kindCounts = {};
  for (const record of included) kindCounts[record.kind || 'unknown'] = (kindCounts[record.kind || 'unknown'] || 0) + 1;
  return {
    included: included.length, workExcluded: valid.length - included.length,
    attachmentCount: attachments.size, attachments: [...attachments.values()],
    kindCounts, records: included.map(safeRecord).filter(Boolean),
  };
}

export function createMetadataArchive(records, exportedAt, { includeWork = false } = {}) {
  const report = archiveReport(records, { includeWork });
  return {
    format: 'mjw-life-metadata-export',
    version: 1,
    exportedAt,
    includesEmployerArea: includeWork,
    records: report.records,
    attachmentReferences: report.attachments,
    counts: { records: report.included, attachmentsNotIncluded: report.attachmentCount, ...report.kindCounts },
    warnings: [
      'This is an unencrypted JSON metadata export. Store it securely and do not share it.',
      'Uploaded document and photo binary files are NOT included and must be downloaded separately.',
      'Local audio recordings are NOT included and must be downloaded from Audio on each device.',
      'Encrypted bank-account vault payloads are intentionally excluded. This export is not a full restore package.',
      ...(report.workExcluded ? [report.workExcluded + ' work-related records were excluded from this export.'] : []),
    ],
  };
}

export function sourceFreshness(records, day) {
  const checkpoint = (Array.isArray(records) ? records : [])
    .filter(row => row.kind === 'gmail_sync' && typeof row.checkedAt === 'string' &&
      Number.isFinite(Date.parse(row.checkedAt)))
    .sort((a,b)=>Date.parse(b.checkedAt)-Date.parse(a.checkedAt))[0];
  if (!checkpoint) return { status: 'not-connected', message: 'No completed Gmail refresh checkpoint stored' };
  const date = checkpoint.checkedAt.slice(0,10);
  const age = Math.max(0, Math.floor((Date.parse(day + 'T12:00:00Z') - Date.parse(date + 'T12:00:00Z')) / 86400000));
  return {
    status: age > 1 ? 'stale' : 'recent', checkedAt: checkpoint.checkedAt, ageDays: age,
    message: (age > 1 ? 'Gmail refresh may be stale' : 'Gmail checkpoint exists') + ' · ' + age + ' day(s) ago',
  };
}

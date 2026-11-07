import { tel } from './personal-model.js';

export const propertyTypes = {
  incident: 'Incident',
  concern: 'Tenant concern',
  maintenance: 'Maintenance',
  site_report: 'Site report',
  leasing: 'Leasing',
  meeting: 'Meeting',
  arrears: 'Arrears',
  vacancy: 'Vacancy',
  budget: 'Property budget',
};

export const propertyStatuses = { open: 'Open', in_progress: 'In progress', waiting: 'Waiting', closed: 'Closed' };
export const leasingStages = {
  enquiry: 'Enquiry', proposal: 'Proposal', negotiation: 'Negotiation', signing: 'Signing', handover: 'Handover',
};
export const vacancyStages = {
  upcoming: 'Upcoming vacancy', available: 'Available', under_offer: 'Under offer', let: 'Let',
};
export const budgetStages = {
  draft: 'Draft', assumptions: 'Assumptions in progress', review: 'Under review',
  approval: 'Awaiting approval', approved: 'Approved', submitted: 'Submitted',
};

export function propertyWorkMatches(item, building, tenantName, query) {
  const text = searchText([
    item.title, item.location, item.reference, item.owner, item.detail, item.nextAction,
    item.tenantName, tenantName, building?.title, building?.code, ...(item.followUpNotes || []).map(note => note.text),
  ].join(' '));
  return searchText(query).split(' ').every(term => text.includes(term));
}

export const sitePhoneFields = { securityPhone: 'Security / control room', facilitiesPhone: 'Facilities', officePhone: 'Site office' };
export const fpgNumberCategories = {
  facilities: 'Facilities', managers: 'Property managers', security: 'Security', services: 'Service providers', other: 'Other',
};

export const isPropertyEntry = item => item.kind === 'fpg_log' || (item.kind === 'event' && item.propertyType === 'meeting');
export const isPropertyRecord = item => isPropertyEntry(item) ||
  ['fpg_building', 'fpg_tenant', 'fpg_contact', 'fpg_document'].includes(item.kind);

export function propertyPhone(value) {
  const leading = String(value || '').trim().replace(/^\+27\s*\(0\)/, '+27 ').match(/^\+?\d[\d ().-]*\d/);
  return tel(leading?.[0].replaceAll('.', ''));
}

function searchText(value) {
  return String(value || '').normalize('NFKD').replace(/\p{Mark}/gu, '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

export function matchingPropertyPhone(phones, query) {
  const numeric = /^[+\d .()-]+$/.test(query.trim());
  const digits = query.replace(/\D/g, '');
  if (!numeric || digits.length < 3) return undefined;
  return phones.find(value => {
    const number = propertyPhone(value).replace(/\D/g, '');
    const alternate = number.startsWith('27') ? '0' + number.slice(2) : number.startsWith('0') ? '27' + number.slice(1) : number;
    return number.includes(digits) || alternate.includes(digits);
  });
}

export function buildingMatches(building, query) {
  const text = searchText([building.title, building.code, building.erf, building.address].join(' '));
  return searchText(query).split(' ').every(term => text.includes(term))
    || Boolean(matchingPropertyPhone(Object.keys(sitePhoneFields).map(field => building[field]), query));
}

export function tenantMatches(tenant, building, query) {
  if (!query.trim() || matchingPropertyPhone(tenant.phones || [], query)) return true;

  const units = tenant.units || [];
  const text = searchText([
    tenant.title, ...units, ...units.map(unit => unit.replace(/\W/g, '')), ...(tenant.aliases || []),
    ...(tenant.contacts || []), ...(tenant.emails || []), building?.title, building?.code,
  ].join(' '));
  return searchText(query).split(' ').every(term => text.includes(term));
}

export function fpgNumberMatches(contact, query) {
  const text = searchText([contact.title, contact.detail, fpgNumberCategories[contact.category]].join(' '));
  return searchText(query).split(' ').every(term => text.includes(term))
    || Boolean(matchingPropertyPhone([contact.phone, contact.alternatePhone], query));
}

export function readFpgNumber(item, values) {
  const get = field => String(values.get(field) || '').trim();
  const title = get('title');
  const category = get('category');
  const phone = get('phone');
  const alternatePhone = get('alternatePhone');
  if (!title) throw new Error('Enter a name or company.');
  if (!Object.hasOwn(fpgNumberCategories, category)) throw new Error('Choose a category.');
  if ([phone, alternatePhone].some(number => number && !propertyPhone(number))) throw new Error('Check the phone numbers.');
  return { ...item, area: 'fpg', title, category, phone, alternatePhone, detail: get('detail') };
}

export function propertyAttention(records, day) {
  return records.filter(item => isPropertyEntry(item) && item.status !== 'closed' && (item.escalated || (item.due && item.due <= day)))
    .sort((a, b) => Number(Boolean(b.escalated)) - Number(Boolean(a.escalated)) || (a.due || '9999').localeCompare(b.due || '9999'));
}

const lines = value => [...new Set(value.split(/\r?\n/).map(line => line.trim()).filter(Boolean))];

export function readPropertyRecord(item, values, propertyType, buildings, tenants) {
  const get = field => String(values.get(field) || '').trim();
  const record = { ...item, area: 'fpg', title: get('title'), detail: get('detail') };
  if (!record.title) throw new Error('Enter a name or title.');

  if (item.kind === 'fpg_building') {
    for (const field of Object.keys(sitePhoneFields)) {
      record[field] = get(field);
      if (record[field] && !propertyPhone(record[field])) throw new Error('Check the ' + sitePhoneFields[field].toLowerCase() + ' phone number.');
    }
    return Object.assign(record, { code: get('code'), address: get('address'), erf: get('erf') });
  }

  const buildingId = get('buildingId');
  if (!buildings.some(building => building.id === buildingId)) throw new Error('Choose a property.');
  record.buildingId = buildingId;
  if (item.kind === 'fpg_tenant') {
    const phones = lines(get('phones'));
    const emails = lines(get('emails'));
    if (phones.some(value => !propertyPhone(value))) throw new Error('Enter one valid phone number per line. Put any label after the number.');
    if (emails.some(value => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) throw new Error('Enter one email address per line.');
    return Object.assign(record, { units: lines(get('units')), contacts: lines(get('contacts')), aliases: lines(get('aliases')), phones, emails });
  }

  const tenantId = get('tenantId');
  const tenant = tenants.find(tenant => tenant.id === tenantId && tenant.buildingId === buildingId);
  const keepsHistoricalLink = item.day && item.tenantId === tenantId && item.buildingId === buildingId;
  if (tenantId && !tenant && !keepsHistoricalLink) throw new Error('Choose a tenant at the selected property.');
  const tenantName = tenant?.title || (keepsHistoricalLink && item.tenantName) || '';
  const day = get('day');
  const status = get('status');
  if (!day || !Object.hasOwn(propertyTypes, propertyType) || !Object.hasOwn(propertyStatuses, status)) throw new Error('Choose a date, type and status.');
  Object.assign(record, { tenantId, tenantName, day, time: get('time'), propertyType, status, location: get('location'), owner: get('owner'),
    due: get('due'), nextAction: get('nextAction'), reference: get('reference'), escalated: values.has('escalated') });
  record.createdAt ||= new Date().toISOString();

  if (propertyType === 'meeting') {
    const start = get('start');
    const end = get('end');
    if (!start || !end || end <= start) throw new Error('Set a start and end time on the same day.');
    return Object.assign(record, { kind: 'event', eventType: 'meeting', planned: day, endDay: day, place: record.location,
      startsAt: day + 'T' + start + ':00+02:00', endsAt: day + 'T' + end + ':00+02:00' });
  }
  if (propertyType === 'leasing') record.stage = get('stage');
  if (['arrears', 'vacancy', 'budget'].includes(propertyType)) {
    const note = get('followUpNote');
    if (note.length > 2000) throw new Error('Keep the follow-up note under 2,000 characters.');
    if (note) record.followUpNotes = [...(record.followUpNotes || []), { text: note, at: new Date().toISOString() }];
  }
  if (propertyType === 'arrears') {
    const balance = get('amount');
    if (balance && !/^(?:\d{1,9}(?:\.\d{1,2})?|\.\d{1,2})$/.test(balance)) throw new Error('Enter the arrears balance in rand.');
    record.amount = balance ? Math.round(Number(balance) * 100) : null;
  }
  if (propertyType === 'budget') {
    const stage = get('budgetStage') || item.budgetStage || 'draft';
    if (!Object.hasOwn(budgetStages, stage)) throw new Error('Choose a valid budget stage.');
    const submittedOn = get('submittedOn');
    if (stage === 'submitted' && !submittedOn) throw new Error('Enter the date when the budget was submitted.');
    if (submittedOn && !/^\d{4}-\d{2}-\d{2}$/.test(submittedOn)) throw new Error('Check the budget submission date.');
    return Object.assign(record, {
      budgetStage: stage, budgetPeriod: get('budgetPeriod').slice(0, 60),
      budgetVersion: get('budgetVersion').slice(0, 60),
      submittedOn, submissionRef: get('submissionRef').slice(0, 220),
    });
  }
  if (propertyType === 'vacancy') {
    const area = get('floorArea');
    if (area && !(Number(area) >= .01 && Number(area) <= 9999999)) throw new Error('Enter a floor area between 0.01 and 9,999,999 m².');
    const stage = get('vacancyStage');
    if (stage && !Object.hasOwn(vacancyStages, stage)) throw new Error('Choose a vacancy stage.');
    record.floorArea = area ? Number(area) : null;
    record.vacancyStage = stage;
    record.availableFrom = get('availableFrom');
  }
  return record;
}

export const maxPropertyPhotos = 6;

export async function preparePropertyPhoto(file) {
  if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('Choose an image up to 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    context.fillStyle = '#fff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const jpeg = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .86));
    if (!jpeg?.size) throw new Error('Could not prepare photo.');
    return new File([jpeg], (file.name.replace(/\.[^.]+$/, '').slice(0, 90) || 'Site photo') + '.jpg', { type: 'image/jpeg' });
  } catch {
    throw new Error('This image could not be opened. Try a JPG, PNG or WebP photo.');
  } finally {
    URL.revokeObjectURL(url);
  }
}

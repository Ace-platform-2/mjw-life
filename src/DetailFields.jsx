import React from 'react';
import { accountTypes, encryptAccount, homeCategories } from './personal-model.js';

const areaFor = { person: 'family', emergency: 'mornay', house_item: 'house', bank_account: 'finance', travel: 'finance', tax_receipt: 'finance' };
export const isDetail = kind => Object.hasOwn(areaFor, kind);

export async function detailRecord(record, fields, day) {
  const get = key => String(fields.get(key) ?? '').trim();
  const number = key => get(key) === '' ? null : Number(get(key));
  const amount = key => Math.round((number(key) || 0) * 100);
  record.area = areaFor[record.kind];
  record.detail = get('detail');
  switch (record.kind) {
    case 'person':
      Object.assign(record, { relationship: get('relationship'), phone: get('phone'), alternatePhone: get('alternatePhone'),
        email: get('email'), address: get('address'), birthday: get('birthday'), birthdayNote: get('birthdayNote'), emergencyContact: fields.has('emergencyContact') });
      break;
    case 'emergency':
      Object.assign(record, { address: get('address'), allergies: get('allergies'), conditions: get('conditions'), medications: get('medications'),
        medicalAid: get('medicalAid'), plan: get('plan'), member: get('member'), insurerPhone: get('insurerPhone'), gapCover: get('gapCover'),
        doctor: get('doctor'), doctorPhone: get('doctorPhone'), otherContact: get('otherContact'), otherPhone: get('otherPhone'), updatedOn: day });
      break;
    case 'house_item': {
      const repeat = get('repeat');
      const due = get('due');
      if (repeat && !due) throw new Error('Set a next date for a repeating item.');
      Object.assign(record, { category: get('category'), quantity: get('quantity'), due, repeat, owner: get('owner'),
        priority: fields.has('priority'), repeatDay: due === record.due && record.repeatDay ? record.repeatDay : Number(due.slice(-2)) });
      break;
    }
    case 'bank_account': {
      const secret = get('accountNumber');
      if (secret) Object.assign(record, await encryptAccount(secret, String(fields.get('passphrase') ?? '')));
      if (!record.vault) throw new Error('Enter the account number and a vault passphrase.');
      Object.assign(record, { bank: get('bank'), accountType: get('accountType') });
      break;
    }
    case 'travel': {
      const start = number('odometerStart');
      const end = number('odometerEnd');
      const directKm = number('km');
      const trip = get('travelType') === 'trip';
      if (trip && (start === null) !== (end === null)) throw new Error('Enter both odometer readings or enter kilometres directly.');
      if (trip && start !== null && end <= start) throw new Error('End odometer must be greater than start.');
      const km = trip ? start === null ? directKm : Math.round((end - start) * 100) / 100 : 0;
      if (trip && !(km > 0)) throw new Error('Enter the kilometres travelled.');
      const litres = number('litres') || 0;
      const fuel = amount('fuel');
      const other = amount('amount');
      if (!trip && !litres && !fuel && !other) throw new Error('Enter litres or an expense for this entry.');
      Object.assign(record, { day: get('day'), vehicle: get('vehicle'), travelType: get('travelType'), use: get('use'),
        from: get('from'), destination: get('destination'), odometerStart: start, odometerEnd: end,
        km, litres, fuel, amount: other });
      break;
    }
    case 'tax_receipt':
      Object.assign(record, { day: get('day'), category: get('category'), amount: amount('amount'), use: get('use'),
        reference: get('reference'), reviewStatus: get('reviewStatus') });
      break;
  }
  return record;
}

function Text({ item, name, label, type = 'text', required = false, maxLength = 300, placeholder }) {
  return <label>{label}<input type={type} name={name} defaultValue={item[name] || ''} required={required} maxLength={maxLength} placeholder={placeholder} /></label>;
}

function Select({ item, name, label, choices, fallback = '' }) {
  return <label>{label}<select name={name} defaultValue={item[name] || fallback}>{Object.entries(choices).map(([value, title]) =>
    <option key={value} value={value}>{title}</option>)}</select></label>;
}

const use = { business: 'Business', personal: 'Personal', mixed: 'Mixed / review' };
const docAccept = '.pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.docx,.xlsx';

export function DetailFields({ kind, item, day }) {
  const text = (name, label, options) => <Text item={item} name={name} label={label} {...options} />;
  const select = (name, label, choices, fallback) => <Select item={item} name={name} label={label} choices={choices} fallback={fallback} />;
  const decimal = (name, label, value, required) => <label>{label}<input name={name} type="number" min="0" max="1000000000" step=".01" defaultValue={value ?? ''} required={required} /></label>;
  return <>
    {kind === 'person' && <>
      {text('relationship', 'Relationship', { required: true })}
      <div className="two-fields">{text('phone', 'Phone', { type: 'tel' })}{text('alternatePhone', 'Alternate phone', { type: 'tel' })}</div>
      {text('email', 'Email', { type: 'email' })}
      <div className="two-fields">{text('birthday', 'Date of birth', { type: 'date' })}{text('birthdayNote', 'Birthday if year is unknown', { placeholder: 'e.g. 1 November' })}</div>
      {text('address', 'Address')}
      <label className="tick"><input type="checkbox" name="emergencyContact" defaultChecked={item.emergencyContact} /> Show on my emergency card</label>
    </>}
    {kind === 'emergency' && <>
      {text('address', 'Home address')}
      {text('allergies', 'Allergies')}
      {text('conditions', 'Important conditions')}
      <label>Confirmed medications and instructions<textarea name="medications" rows="3" maxLength="3000" defaultValue={item.medications} /></label>
      <div className="two-fields">{text('medicalAid', 'Medical aid')}{text('plan', 'Plan')}</div>
      <div className="two-fields">{text('member', 'Member number')}{text('insurerPhone', 'Medical aid phone', { type: 'tel' })}</div>
      {text('gapCover', 'Gap cover and policy details')}
      <div className="two-fields">{text('doctor', 'Doctor or practice')}{text('doctorPhone', 'Doctor’s phone', { type: 'tel' })}</div>
      <div className="two-fields">{text('otherContact', 'Additional emergency contact')}{text('otherPhone', 'Contact phone', { type: 'tel' })}</div>
    </>}
    {kind === 'house_item' && <>
      {select('category', 'List', homeCategories, 'shopping')}
      {text('quantity', 'Quantity or supplies')}
      <div className="two-fields">{text('due', 'Next date', { type: 'date' })}{select('repeat', 'Repeat', { '': 'Never', weekly: 'Weekly', monthly: 'Monthly' })}</div>
      {text('owner', 'Person or contractor')}
      <label className="tick"><input type="checkbox" name="priority" defaultChecked={item.priority} /> Needs attention</label>
    </>}
    {kind === 'bank_account' && <>
      {text('bank', 'Bank', { required: true })}
      {select('accountType', 'Account type', accountTypes, 'current')}
      <label>{item.vault ? 'Replace account number (optional)' : 'Account number'}<input type="password" name="accountNumber" inputMode="numeric" autoComplete="off" maxLength="50" required={!item.vault} /></label>
      <label>Vault passphrase<input type="password" name="passphrase" autoComplete="new-password" minLength="12" maxLength="200" required={!item.vault} /></label>
      <small>The number is encrypted before saving. Keep the passphrase somewhere safe so you can reveal it later.</small>
    </>}
    {kind === 'travel' && <>
      <div className="two-fields">{text('day', 'Date', { type: 'date', required: true })}{text('vehicle', 'Vehicle', { required: true, placeholder: 'e.g. BMW X3' })}</div>
      <div className="two-fields">{select('travelType', 'Entry type', { trip: 'Trip', fuel: 'Fill-up / expense' }, 'trip')}{select('use', 'Use', use, 'personal')}</div>
      <div className="two-fields">{text('from', 'From')}{text('destination', 'Destination')}</div>
      <div className="two-fields">{decimal('odometerStart', 'Start odometer (km)', item.odometerStart)}{decimal('odometerEnd', 'End or fill-up odometer (km)', item.odometerEnd)}</div>
      {decimal('km', 'Trip kilometres if no odometer readings', item.km || null)}
      <div className="two-fields">{decimal('litres', 'Diesel litres', item.litres)}{decimal('fuel', 'Diesel cost (R)', item.fuel === undefined ? null : item.fuel / 100)}</div>
      {decimal('amount', 'Other cost (R)', item.amount === undefined ? null : item.amount / 100)}
    </>}
    {kind === 'tax_receipt' && <>
      <div className="two-fields">{text('day', 'Expense date', { type: 'date', required: true })}{decimal('amount', 'Amount (R)', item.amount === undefined ? null : item.amount / 100, true)}</div>
      <div className="two-fields">{text('category', 'Category', { required: true })}{select('use', 'Use', use, 'mixed')}</div>
      {text('reference', 'Receipt or invoice number')}
      {select('reviewStatus', 'Review status', { review: 'To review', reviewed: 'Reviewed' }, 'review')}
      {!item.path && <label>Receipt file (optional)<input name="file" type="file" accept={docAccept} /></label>}
    </>}
    <label>{kind === 'emergency' ? 'Other information responders may need' : 'Notes'}<textarea name="detail" defaultValue={item.detail} maxLength={5000} rows="3" /></label>
  </>;
}

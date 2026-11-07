alter table public.life_records
  drop constraint life_records_kind_check,
  add constraint life_records_kind_check check (kind in (
    'area', 'task', 'goal', 'habit', 'checkin', 'review', 'capacity', 'bill', 'balance',
    'event', 'note', 'journal', 'document', 'budget', 'expense', 'bill_payment', 'medication', 'dose',
    'person', 'emergency', 'house_item', 'bank_account', 'travel', 'tax_receipt', 'gmail_sync',
    'fpg_building', 'fpg_tenant', 'fpg_log', 'fpg_document', 'fpg_contact'
  ));

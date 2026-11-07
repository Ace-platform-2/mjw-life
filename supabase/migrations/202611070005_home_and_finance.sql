alter table public.life_records
  drop constraint life_records_kind_check,
  add constraint life_records_kind_check check (kind in (
    'area', 'task', 'goal', 'habit', 'checkin', 'review', 'capacity', 'bill', 'balance',
    'event', 'note', 'journal', 'document', 'budget', 'expense', 'bill_payment', 'medication', 'dose',
    'person', 'emergency', 'house_item', 'bank_account', 'travel', 'tax_receipt', 'gmail_sync'
  ));

create function public.save_life_gmail_refresh(p_key text, p_expected text, p_checkpoint jsonb, p_messages jsonb)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  account uuid := auth.uid();
  changed integer;
begin
  if account is null then return false; end if;
  if p_key is null or p_key !~ '^gmail-sync:[a-f0-9]{32}$'
    or p_checkpoint->>'historyId' is null
    or p_checkpoint->>'runId' is null
    or jsonb_typeof(p_messages) is distinct from 'array'
  then raise exception 'Invalid Gmail refresh'; end if;

  if p_expected is null then
    insert into public.life_records (user_id, id, kind, data)
    values (account, p_key, 'gmail_sync', p_checkpoint)
    on conflict (user_id, id) do nothing;
  else
    update public.life_records
    set data = p_checkpoint
    where user_id = account and id = p_key and kind = 'gmail_sync' and data->>'runId' = p_expected;
  end if;
  get diagnostics changed = row_count;
  if changed <> 1 then return false; end if;

  insert into public.life_records (user_id, id, kind, data)
  select account, entry->>'id', 'task', entry - 'id' - 'kind'
  from jsonb_array_elements(p_messages) entry
  where entry->>'id' like 'gmail:' || split_part(p_key, ':', 2) || ':%'
    and entry->>'source' = 'Gmail'
  on conflict (user_id, id) do nothing;
  return true;
end;
$$;

revoke all on function public.save_life_gmail_refresh(text, text, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.save_life_gmail_refresh(text, text, jsonb, jsonb) to authenticated;

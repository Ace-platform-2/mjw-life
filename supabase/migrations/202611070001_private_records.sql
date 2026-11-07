create table public.life_records (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  id text not null check (length(id) between 1 and 200),
  kind text not null check (kind in ('area', 'task', 'goal', 'habit', 'checkin', 'review', 'capacity', 'bill', 'balance')),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  primary key (user_id, id)
);

alter table public.life_records enable row level security;
revoke all on public.life_records from anon, authenticated;
grant select, insert, update, delete on public.life_records to authenticated;
create policy private_records on public.life_records
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

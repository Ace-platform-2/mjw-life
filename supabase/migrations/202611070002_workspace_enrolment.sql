create table public.life_workspace_members (
  user_id uuid primary key references auth.users(id) on delete cascade
);

alter table public.life_workspace_members enable row level security;
revoke all on public.life_workspace_members from anon, authenticated;
grant select on public.life_workspace_members to authenticated;
create policy own_workspace_membership on public.life_workspace_members
  for select to authenticated using (user_id = (select auth.uid()));

create policy workspace_enrolment on public.life_records
  as restrictive for all to authenticated
  using (exists (select 1 from public.life_workspace_members where user_id = (select auth.uid())))
  with check (exists (select 1 from public.life_workspace_members where user_id = (select auth.uid())));

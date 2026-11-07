create schema if not exists mjw_private;
revoke all on schema mjw_private from public, anon, authenticated;

create table mjw_private.workspace_invitations (
  email text primary key check (email = lower(email))
);

create function public.activate_life_workspace()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  account_id uuid := auth.uid();
  invited_email text;
begin
  if account_id is null then return false; end if;
  if exists (select 1 from public.life_workspace_members where user_id = account_id) then
    return true;
  end if;
  delete from mjw_private.workspace_invitations i
    using auth.users u
    where u.id = account_id
      and u.email_confirmed_at is not null
      and i.email = lower(u.email)
    returning i.email into invited_email;
  if invited_email is null then
    return exists (select 1 from public.life_workspace_members where user_id = account_id);
  end if;
  insert into public.life_workspace_members (user_id) values (account_id)
    on conflict do nothing;
  return true;
end;
$$;
revoke all on function public.activate_life_workspace() from public, anon, authenticated;
grant execute on function public.activate_life_workspace() to authenticated;

alter table public.life_records
  drop constraint life_records_kind_check,
  add constraint life_records_kind_check check (kind in (
    'area', 'task', 'goal', 'habit', 'checkin', 'review', 'capacity', 'bill', 'balance',
    'event', 'note', 'journal', 'document', 'budget', 'expense', 'bill_payment', 'medication', 'dose'
  ));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('life-documents', 'life-documents', false, 10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'text/plain', 'text/csv',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);

create policy life_documents_read on storage.objects for select to authenticated
using (bucket_id = 'life-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.life_workspace_members where user_id = (select auth.uid())));

create policy life_documents_add on storage.objects for insert to authenticated
with check (bucket_id = 'life-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.life_workspace_members where user_id = (select auth.uid())));

create policy life_documents_delete on storage.objects for delete to authenticated
using (bucket_id = 'life-documents'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (select 1 from public.life_workspace_members where user_id = (select auth.uid())));

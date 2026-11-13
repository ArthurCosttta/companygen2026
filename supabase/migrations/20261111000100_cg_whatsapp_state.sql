begin;

create table if not exists public.cg_whatsapp_state (
  user_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision >= 0),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.cg_whatsapp_state enable row level security;
alter table public.cg_whatsapp_state force row level security;

drop policy if exists "cg_whatsapp_select_own" on public.cg_whatsapp_state;
create policy "cg_whatsapp_select_own"
  on public.cg_whatsapp_state for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "cg_whatsapp_insert_own" on public.cg_whatsapp_state;
create policy "cg_whatsapp_insert_own"
  on public.cg_whatsapp_state for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "cg_whatsapp_update_own" on public.cg_whatsapp_state;
create policy "cg_whatsapp_update_own"
  on public.cg_whatsapp_state for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "cg_whatsapp_delete_own" on public.cg_whatsapp_state;
create policy "cg_whatsapp_delete_own"
  on public.cg_whatsapp_state for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.cg_put_whatsapp_state(p_revision bigint, p_data jsonb)
returns bigint
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_revision bigint;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_revision < 0 or jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid whatsapp state' using errcode = '22023';
  end if;

  update public.cg_whatsapp_state
     set data = p_data,
         revision = revision + 1,
         updated_at = now()
   where user_id = auth.uid()
     and revision = p_revision
  returning revision into next_revision;

  if found then return next_revision; end if;

  if p_revision = 0 then
    insert into public.cg_whatsapp_state (user_id, revision, data)
    values (auth.uid(), 1, p_data)
    on conflict (user_id) do nothing
    returning revision into next_revision;
    if found then return next_revision; end if;
  end if;

  raise exception 'whatsapp state changed concurrently' using errcode = '40001';
end;
$$;

revoke all on public.cg_whatsapp_state from anon;
grant select, insert, update, delete on public.cg_whatsapp_state to authenticated;
revoke all on function public.cg_put_whatsapp_state(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.cg_put_whatsapp_state(bigint, jsonb) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'cg-whatsapp-media',
  'cg-whatsapp-media',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/ogg', 'audio/mpeg', 'audio/wav']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "cg_whatsapp_media_select_own" on storage.objects;
create policy "cg_whatsapp_media_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'cg-whatsapp-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "cg_whatsapp_media_insert_own" on storage.objects;
create policy "cg_whatsapp_media_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'cg-whatsapp-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "cg_whatsapp_media_update_own" on storage.objects;
create policy "cg_whatsapp_media_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'cg-whatsapp-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'cg-whatsapp-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "cg_whatsapp_media_delete_own" on storage.objects;
create policy "cg_whatsapp_media_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'cg-whatsapp-media'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

commit;

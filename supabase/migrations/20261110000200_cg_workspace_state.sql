begin;

create table public.cg_workspace_state (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision > 0),
  data jsonb not null check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.cg_workspace_state enable row level security;
alter table public.cg_workspace_state force row level security;
revoke all on public.cg_workspace_state from public, anon, authenticated;
grant select, insert, update on public.cg_workspace_state to authenticated;

create policy workspace_read on public.cg_workspace_state
  for select to authenticated using (user_id = (select auth.uid()));
create policy workspace_insert on public.cg_workspace_state
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy workspace_update on public.cg_workspace_state
  for update to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create function public.cg_put_workspace(p_revision bigint, p_data jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  saved_revision bigint;
begin
  if p_revision = 0 then
    insert into public.cg_workspace_state (user_id, data)
    values (auth.uid(), p_data)
    on conflict (user_id) do nothing
    returning revision into saved_revision;
  else
    update public.cg_workspace_state
    set data = p_data, revision = revision + 1, updated_at = pg_catalog.now()
    where user_id = auth.uid() and revision = p_revision
    returning revision into saved_revision;
  end if;

  if saved_revision is null then
    raise exception 'workspace revision conflict' using errcode = '40001';
  end if;
  return saved_revision;
end;
$$;

revoke all on function public.cg_put_workspace(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.cg_put_workspace(bigint, jsonb) to authenticated;

commit;

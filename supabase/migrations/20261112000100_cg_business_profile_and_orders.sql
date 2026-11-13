begin;

create table if not exists public.cg_business_profile (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  revision bigint not null default 1 check (revision >= 0),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.cg_business_profile enable row level security;
alter table public.cg_business_profile force row level security;

revoke all on public.cg_business_profile from public, anon, authenticated;
grant select, insert, update, delete on public.cg_business_profile to authenticated;

drop policy if exists "cg_business_profile_select_own" on public.cg_business_profile;
create policy "cg_business_profile_select_own"
  on public.cg_business_profile for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "cg_business_profile_insert_own" on public.cg_business_profile;
create policy "cg_business_profile_insert_own"
  on public.cg_business_profile for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "cg_business_profile_update_own" on public.cg_business_profile;
create policy "cg_business_profile_update_own"
  on public.cg_business_profile for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "cg_business_profile_delete_own" on public.cg_business_profile;
create policy "cg_business_profile_delete_own"
  on public.cg_business_profile for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.cg_put_business_profile(p_revision bigint, p_data jsonb)
returns bigint
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_revision bigint;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_revision < 0 or jsonb_typeof(p_data) <> 'object' then
    raise exception 'invalid business profile' using errcode = '22023';
  end if;

  update public.cg_business_profile
     set data = p_data,
         revision = revision + 1,
         updated_at = pg_catalog.now()
   where user_id = auth.uid()
     and revision = p_revision
  returning revision into next_revision;

  if found then return next_revision; end if;

  if p_revision = 0 then
    insert into public.cg_business_profile (user_id, revision, data)
    values (auth.uid(), 1, p_data)
    on conflict (user_id) do nothing
    returning revision into next_revision;
    if found then return next_revision; end if;
  end if;

  raise exception 'business profile changed concurrently' using errcode = '40001';
end;
$$;

revoke all on function public.cg_put_business_profile(bigint, jsonb) from public, anon, authenticated;
grant execute on function public.cg_put_business_profile(bigint, jsonb) to authenticated;

create table if not exists public.cg_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  order_ref text not null,
  customer_jid text not null default '',
  customer_name text not null default '',
  items jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array'),
  subtotal_cents integer not null default 0 check (subtotal_cents >= 0),
  shipping_cents integer not null default 0 check (shipping_cents >= 0),
  total_cents integer not null default 0 check (total_cents >= 0),
  payment_method text not null default 'pendente',
  delivery_address jsonb not null default '{}'::jsonb check (jsonb_typeof(delivery_address) = 'object'),
  status text not null default 'aguardando_dados'
    check (status in ('aguardando_dados', 'aguardando_pagamento', 'confirmado', 'cancelado', 'concluido')),
  source_revision bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cg_orders_user_ref_idx on public.cg_orders (user_id, order_ref);
create index if not exists cg_orders_user_created_idx on public.cg_orders (user_id, created_at desc);

alter table public.cg_orders enable row level security;
alter table public.cg_orders force row level security;

revoke all on public.cg_orders from public, anon, authenticated;
grant select, insert, update, delete on public.cg_orders to authenticated;

drop policy if exists "cg_orders_select_own" on public.cg_orders;
create policy "cg_orders_select_own"
  on public.cg_orders for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "cg_orders_insert_own" on public.cg_orders;
create policy "cg_orders_insert_own"
  on public.cg_orders for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "cg_orders_update_own" on public.cg_orders;
create policy "cg_orders_update_own"
  on public.cg_orders for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "cg_orders_delete_own" on public.cg_orders;
create policy "cg_orders_delete_own"
  on public.cg_orders for delete
  to authenticated
  using ((select auth.uid()) = user_id);

create table if not exists public.cg_store_metrics (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  visits_total integer not null default 0 check (visits_total >= 0),
  visits_by_day jsonb not null default '{}'::jsonb check (jsonb_typeof(visits_by_day) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.cg_store_metrics enable row level security;
alter table public.cg_store_metrics force row level security;

revoke all on public.cg_store_metrics from public, anon, authenticated;
grant select, insert, update, delete on public.cg_store_metrics to authenticated;

drop policy if exists "cg_store_metrics_select_own" on public.cg_store_metrics;
create policy "cg_store_metrics_select_own"
  on public.cg_store_metrics for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "cg_store_metrics_insert_own" on public.cg_store_metrics;
create policy "cg_store_metrics_insert_own"
  on public.cg_store_metrics for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "cg_store_metrics_update_own" on public.cg_store_metrics;
create policy "cg_store_metrics_update_own"
  on public.cg_store_metrics for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.cg_increment_store_visit(p_day text)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  next_row jsonb;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_day !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid day' using errcode = '22023';
  end if;

  insert into public.cg_store_metrics (user_id, visits_total, visits_by_day)
  values (auth.uid(), 1, jsonb_build_object(p_day, 1))
  on conflict (user_id) do update
    set visits_total = public.cg_store_metrics.visits_total + 1,
        visits_by_day = jsonb_set(
          public.cg_store_metrics.visits_by_day,
          array[p_day],
          to_jsonb(coalesce((public.cg_store_metrics.visits_by_day ->> p_day)::int, 0) + 1),
          true
        ),
        updated_at = pg_catalog.now()
  returning jsonb_build_object('visits_total', visits_total, 'visits_by_day', visits_by_day)
  into next_row;

  return next_row;
end;
$$;

revoke all on function public.cg_increment_store_visit(text) from public, anon, authenticated;
grant execute on function public.cg_increment_store_visit(text) to authenticated;

commit;

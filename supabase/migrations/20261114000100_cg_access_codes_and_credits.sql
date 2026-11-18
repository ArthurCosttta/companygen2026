-- Sistema transacional de códigos, carteira de créditos e eventos Kiwify.
-- Esta migration ainda não havia sido aplicada no projeto remoto em 17/11/2026.

begin;

create extension if not exists pgcrypto with schema extensions;

-- Códigos são armazenados somente como SHA-256. O texto puro existe apenas
-- durante a geração e no e-mail enviado ao comprador.
create table if not exists public.cg_access_codes (
  id uuid primary key default gen_random_uuid(),
  code_hash text not null unique,
  code_masked text not null,
  credits integer not null check (credits > 0),
  max_redemptions integer not null default 1 check (max_redemptions > 0),
  redemption_count integer not null default 0 check (redemption_count >= 0),
  expires_at timestamptz,
  status text not null default 'active'
    check (status in ('active', 'revoked', 'depleted', 'expired')),
  purchaser_email text,
  source_order_id text,
  source_event_type text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists cg_access_codes_source_event_key
  on public.cg_access_codes (source_order_id, source_event_type)
  where source_order_id is not null and source_event_type is not null;

create table if not exists public.cg_code_redemptions (
  id uuid primary key default gen_random_uuid(),
  code_id uuid not null references public.cg_access_codes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  ip_hash text,
  constraint cg_code_redemptions_user_code_key unique (code_id, user_id)
);

create table if not exists public.cg_credit_plans (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  kiwify_checkout_code text unique,
  credits integer not null check (credits > 0),
  price_cents integer not null check (price_cents > 0),
  popular boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.cg_payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  customer_email text,
  provider text not null default 'kiwify',
  provider_order_id text,
  plan_id uuid references public.cg_credit_plans(id),
  amount_cents integer not null check (amount_cents > 0),
  credits integer not null check (credits > 0),
  payment_method text,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'failed', 'cancelled', 'refunded', 'chargeback')),
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  paid_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint cg_payment_orders_provider_order_key unique (provider, provider_order_id)
);

-- Uma linha por carteira serializa alterações concorrentes. Saldo negativo é
-- permitido para representar dívida após refund/chargeback de créditos gastos.
create table if not exists public.cg_credit_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance integer not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.cg_credit_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null check (delta <> 0),
  balance_after integer not null,
  operation_type text not null check (operation_type in (
    'welcome_invite', 'purchase_kiwify', 'subscription_renewed',
    'order_refunded', 'chargeback', 'whatsapp_reply_consumed',
    'generate_storefront', 'edit_storefront', 'generate_image',
    'failure_refund', 'manual_adjustment'
  )),
  reference_id text not null unique,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Enriquece a tabela legada já existente no Supabase.
alter table public.kiwify_webhooks
  add column if not exists webhook_event_type text,
  add column if not exists processing_status text not null default 'received',
  add column if not exists attempt_count integer not null default 1,
  add column if not exists credits_delta integer,
  add column if not exists user_id uuid references auth.users(id) on delete set null,
  add column if not exists access_code_id uuid references public.cg_access_codes(id) on delete set null,
  add column if not exists processed_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists email_sent_at timestamptz;

update public.kiwify_webhooks
set webhook_event_type = coalesce(
      nullif(webhook_event_type, ''),
      nullif(payload ->> 'webhook_event_type', ''),
      'unknown'
    ),
    processing_status = case
      when error_message is not null then 'needs_review'
      when processed then 'processed'
      else 'received'
    end,
    processed_at = case when processed then coalesce(processed_at, created_at) else processed_at end,
    updated_at = coalesce(updated_at, created_at);

alter table public.kiwify_webhooks
  alter column webhook_event_type set not null,
  drop constraint if exists kiwify_webhooks_processing_status_check,
  add constraint kiwify_webhooks_processing_status_check
    check (processing_status in ('received', 'processing', 'processed', 'needs_review', 'failed'));

create unique index if not exists kiwify_webhooks_order_event_key
  on public.kiwify_webhooks (order_id, webhook_event_type);
create index if not exists cg_credit_ledger_user_created_idx
  on public.cg_credit_ledger (user_id, created_at desc);
create index if not exists cg_access_codes_purchaser_email_idx
  on public.cg_access_codes (lower(purchaser_email));

alter table public.cg_access_codes enable row level security;
alter table public.cg_access_codes force row level security;
alter table public.cg_code_redemptions enable row level security;
alter table public.cg_code_redemptions force row level security;
alter table public.cg_credit_plans enable row level security;
alter table public.cg_credit_plans force row level security;
alter table public.cg_payment_orders enable row level security;
alter table public.cg_payment_orders force row level security;
alter table public.cg_credit_accounts enable row level security;
alter table public.cg_credit_accounts force row level security;
alter table public.cg_credit_ledger enable row level security;
alter table public.cg_credit_ledger force row level security;

revoke all on public.cg_access_codes from public, anon, authenticated;
revoke all on public.cg_code_redemptions from public, anon, authenticated;
revoke all on public.cg_credit_plans from public, anon, authenticated;
revoke all on public.cg_payment_orders from public, anon, authenticated;
revoke all on public.cg_credit_accounts from public, anon, authenticated;
revoke all on public.cg_credit_ledger from public, anon, authenticated;

grant select on public.cg_credit_plans to authenticated;
grant select on public.cg_code_redemptions to authenticated;
grant select on public.cg_payment_orders to authenticated;
grant select on public.cg_credit_accounts to authenticated;
grant select on public.cg_credit_ledger to authenticated;

drop policy if exists "cg_credit_plans_select_authenticated" on public.cg_credit_plans;
create policy "cg_credit_plans_select_authenticated"
  on public.cg_credit_plans for select to authenticated using (active = true);
drop policy if exists "cg_code_redemptions_select_own" on public.cg_code_redemptions;
create policy "cg_code_redemptions_select_own"
  on public.cg_code_redemptions for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "cg_payment_orders_select_own" on public.cg_payment_orders;
create policy "cg_payment_orders_select_own"
  on public.cg_payment_orders for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "cg_credit_accounts_select_own" on public.cg_credit_accounts;
create policy "cg_credit_accounts_select_own"
  on public.cg_credit_accounts for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "cg_credit_ledger_select_own" on public.cg_credit_ledger;
create policy "cg_credit_ledger_select_own"
  on public.cg_credit_ledger for select to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.cg_get_user_credit_balance(p_user_id uuid)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_balance integer;
begin
  if auth.uid() is distinct from p_user_id
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select balance into v_balance
  from public.cg_credit_accounts
  where user_id = p_user_id;
  return coalesce(v_balance, 0);
end;
$$;

revoke all on function public.cg_get_user_credit_balance(uuid) from public, anon, authenticated;
grant execute on function public.cg_get_user_credit_balance(uuid) to authenticated, service_role;

create or replace function public.cg_redeem_access_code(p_code text, p_ip_hash text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_code_hash text;
  v_code public.cg_access_codes%rowtype;
  v_new_balance integer;
  v_redemption_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));
  v_code_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.lower(pg_catalog.btrim(p_code)), 'sha256'), 'hex'
  );

  select * into v_code
  from public.cg_access_codes
  where code_hash = v_code_hash
  for update;

  if not found then return jsonb_build_object('success', false, 'error', 'invalid_code'); end if;
  if v_code.status <> 'active' then return jsonb_build_object('success', false, 'error', 'inactive_code'); end if;
  if v_code.expires_at is not null and pg_catalog.now() > v_code.expires_at then
    update public.cg_access_codes set status = 'expired' where id = v_code.id;
    return jsonb_build_object('success', false, 'error', 'expired_code');
  end if;
  if v_code.redemption_count >= v_code.max_redemptions then
    update public.cg_access_codes set status = 'depleted' where id = v_code.id;
    return jsonb_build_object('success', false, 'error', 'depleted_code');
  end if;

  insert into public.cg_code_redemptions (code_id, user_id, ip_hash)
  values (v_code.id, v_user_id, p_ip_hash)
  on conflict (code_id, user_id) do nothing
  returning id into v_redemption_id;
  if v_redemption_id is null then
    return jsonb_build_object('success', false, 'error', 'already_redeemed');
  end if;

  update public.cg_access_codes
  set redemption_count = redemption_count + 1,
      status = case when redemption_count + 1 >= max_redemptions then 'depleted' else status end
  where id = v_code.id;

  insert into public.cg_credit_accounts (user_id, balance)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;
  update public.cg_credit_accounts
  set balance = balance + v_code.credits, updated_at = pg_catalog.now()
  where user_id = v_user_id
  returning balance into v_new_balance;

  insert into public.cg_credit_ledger (
    user_id, delta, balance_after, operation_type, reference_id, metadata
  ) values (
    v_user_id, v_code.credits, v_new_balance, 'welcome_invite',
    'access-code:' || v_code.id::text,
    jsonb_build_object('code_masked', v_code.code_masked, 'redemption_id', v_redemption_id)
  );

  return jsonb_build_object(
    'success', true, 'credits_added', v_code.credits,
    'new_balance', v_new_balance, 'code_masked', v_code.code_masked
  );
end;
$$;

revoke all on function public.cg_redeem_access_code(text, text) from public, anon, authenticated;
grant execute on function public.cg_redeem_access_code(text, text) to authenticated;

-- Única fronteira transacional para eventos financeiros Kiwify.
create or replace function public.cg_process_kiwify_event(
  p_order_id text,
  p_event_type text,
  p_order_status text,
  p_customer_email text,
  p_customer_phone text,
  p_plan_code text,
  p_credits integer,
  p_payload jsonb,
  p_access_code_hash text default null,
  p_access_code_masked text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event public.kiwify_webhooks%rowtype;
  v_user_id uuid;
  v_access_code_id uuid;
  v_original public.kiwify_webhooks%rowtype;
  v_redeemed_user_id uuid;
  v_delta integer;
  v_balance integer;
  v_operation text;
  v_action text;
  v_credit_amount integer := p_credits;
  v_is_approved boolean := p_event_type in ('order_approved', 'subscription_renewed');
  v_is_refund boolean := p_event_type in ('order_refunded', 'chargeback');
  v_email text := pg_catalog.lower(pg_catalog.btrim(coalesce(p_customer_email, '')));
begin
  if coalesce(p_order_id, '') = '' or coalesce(p_event_type, '') = '' then
    raise exception 'missing event identity' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_order_id || ':' || p_event_type, 0)
  );
  select * into v_event
  from public.kiwify_webhooks
  where order_id = p_order_id and webhook_event_type = p_event_type
  for update;

  if found and v_event.processing_status = 'processed' then
    return jsonb_build_object(
      'success', true, 'duplicate', true, 'status', 'processed',
      'action', 'duplicate', 'balance', null
    );
  end if;

  if not found then
    insert into public.kiwify_webhooks (
      order_id, order_status, customer_email, customer_phone, plan_code,
      payload, processed, error_message, webhook_event_type,
      processing_status, attempt_count, updated_at
    ) values (
      p_order_id, p_order_status, nullif(v_email, ''), p_customer_phone, p_plan_code,
      p_payload, false, null, p_event_type, 'processing', 1, pg_catalog.now()
    ) returning * into v_event;
  else
    update public.kiwify_webhooks
    set order_status = p_order_status,
        customer_email = nullif(v_email, ''), customer_phone = p_customer_phone,
        plan_code = p_plan_code, payload = p_payload, processed = false,
        error_message = null, processing_status = 'processing',
        attempt_count = attempt_count + 1, updated_at = pg_catalog.now()
    where id = v_event.id
    returning * into v_event;
  end if;

  if not v_is_approved and not v_is_refund then
    update public.kiwify_webhooks
    set processed = true, processing_status = 'processed',
        processed_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = v_event.id;
    return jsonb_build_object('success', true, 'status', 'processed', 'action', 'noop');
  end if;

  if v_email = '' then
    update public.kiwify_webhooks
    set processing_status = 'needs_review', error_message = 'missing_customer_email',
        updated_at = pg_catalog.now()
    where id = v_event.id;
    return jsonb_build_object('success', false, 'status', 'needs_review', 'error', 'missing_customer_email');
  end if;
  if v_is_approved and (v_credit_amount is null or v_credit_amount <= 0) then
    update public.kiwify_webhooks
    set processing_status = 'needs_review', error_message = 'unknown_plan',
        updated_at = pg_catalog.now()
    where id = v_event.id;
    return jsonb_build_object('success', false, 'status', 'needs_review', 'error', 'unknown_plan');
  end if;

  select id into v_user_id
  from auth.users
  where pg_catalog.lower(email) = v_email
  order by created_at
  limit 1;

  if v_is_approved and v_user_id is null then
    if coalesce(p_access_code_hash, '') = '' or coalesce(p_access_code_masked, '') = '' then
      raise exception 'access code required for buyer without account' using errcode = '22023';
    end if;
    insert into public.cg_access_codes (
      code_hash, code_masked, credits, max_redemptions, purchaser_email,
      source_order_id, source_event_type
    ) values (
      p_access_code_hash, p_access_code_masked, v_credit_amount, 1, v_email,
      p_order_id, p_event_type
    )
    on conflict (source_order_id, source_event_type)
      where source_order_id is not null and source_event_type is not null
    do update set purchaser_email = excluded.purchaser_email
    returning id into v_access_code_id;

    update public.kiwify_webhooks
    set processed = true, processing_status = 'processed',
        access_code_id = v_access_code_id, credits_delta = v_credit_amount,
        processed_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = v_event.id;
    return jsonb_build_object(
      'success', true, 'status', 'processed', 'action', 'access_code_created',
      'credits_delta', v_credit_amount, 'balance', null
    );
  end if;

  if v_is_refund then
    if exists (
      select 1
      from public.kiwify_webhooks reversal
      where reversal.order_id = p_order_id
        and reversal.webhook_event_type in ('order_refunded', 'chargeback')
        and reversal.id <> v_event.id
        and reversal.processing_status = 'processed'
    ) then
      update public.kiwify_webhooks
      set processed = true, processing_status = 'processed', credits_delta = 0,
          error_message = 'already_reversed', processed_at = pg_catalog.now(),
          updated_at = pg_catalog.now()
      where id = v_event.id;
      return jsonb_build_object(
        'success', true, 'duplicate', true, 'status', 'processed',
        'action', 'already_reversed', 'credits_delta', 0, 'balance', null
      );
    end if;

    select * into v_original
    from public.kiwify_webhooks
    where order_id = p_order_id
      and webhook_event_type in ('order_approved', 'subscription_renewed')
      and processing_status = 'processed'
    order by processed_at desc nulls last, created_at desc
    limit 1
    for update;

    v_credit_amount := coalesce(v_credit_amount, abs(v_original.credits_delta));
    if v_credit_amount is null or v_credit_amount <= 0 then
      update public.kiwify_webhooks
      set processing_status = 'needs_review', error_message = 'original_credit_amount_not_found',
          updated_at = pg_catalog.now()
      where id = v_event.id;
      return jsonb_build_object(
        'success', false, 'status', 'needs_review',
        'error', 'original_credit_amount_not_found'
      );
    end if;

    if found and v_original.user_id is not null then
      v_user_id := v_original.user_id;
    elsif found and v_original.access_code_id is not null then
      select user_id into v_redeemed_user_id
      from public.cg_code_redemptions
      where code_id = v_original.access_code_id
      order by redeemed_at
      limit 1;
      if v_redeemed_user_id is null then
        update public.cg_access_codes set status = 'revoked'
        where id = v_original.access_code_id and status = 'active';
        update public.kiwify_webhooks
        set processed = true, processing_status = 'processed',
            access_code_id = v_original.access_code_id, credits_delta = 0,
            processed_at = pg_catalog.now(), updated_at = pg_catalog.now()
        where id = v_event.id;
        return jsonb_build_object(
          'success', true, 'status', 'processed', 'action', 'access_code_revoked',
          'credits_delta', 0, 'balance', null
        );
      end if;
      v_user_id := v_redeemed_user_id;
    end if;

    if v_user_id is null then
      update public.kiwify_webhooks
      set processing_status = 'needs_review', error_message = 'original_credit_not_found',
          updated_at = pg_catalog.now()
      where id = v_event.id;
      return jsonb_build_object('success', false, 'status', 'needs_review', 'error', 'original_credit_not_found');
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));
  insert into public.cg_credit_accounts (user_id, balance)
  values (v_user_id, 0)
  on conflict (user_id) do nothing;

  v_delta := case when v_is_approved then v_credit_amount else -v_credit_amount end;
  v_operation := case
    when p_event_type = 'subscription_renewed' then 'subscription_renewed'
    when p_event_type = 'order_refunded' then 'order_refunded'
    when p_event_type = 'chargeback' then 'chargeback'
    else 'purchase_kiwify'
  end;
  update public.cg_credit_accounts
  set balance = balance + v_delta, updated_at = pg_catalog.now()
  where user_id = v_user_id
  returning balance into v_balance;

  insert into public.cg_credit_ledger (
    user_id, delta, balance_after, operation_type, reference_id, metadata
  ) values (
    v_user_id, v_delta, v_balance, v_operation,
    'kiwify:' || p_order_id || ':' || p_event_type,
    jsonb_build_object('plan_code', p_plan_code, 'customer_email', v_email)
  );

  v_action := case when v_is_approved then 'account_credited' else 'account_debited' end;
  update public.kiwify_webhooks
  set processed = true, processing_status = 'processed', user_id = v_user_id,
      credits_delta = v_delta, processed_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where id = v_event.id;
  return jsonb_build_object(
    'success', true, 'status', 'processed', 'action', v_action,
    'credits_delta', v_delta, 'balance', v_balance
  );
exception when others then
  if v_event.id is not null then
    update public.kiwify_webhooks
    set processed = false, processing_status = 'failed',
        error_message = SQLSTATE || ': ' || SQLERRM, updated_at = pg_catalog.now()
    where id = v_event.id;
  end if;
  return jsonb_build_object(
    'success', false,
    'status', 'failed',
    'error', SQLSTATE
  );
end;
$$;

revoke all on function public.cg_process_kiwify_event(
  text, text, text, text, text, text, integer, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.cg_process_kiwify_event(
  text, text, text, text, text, text, integer, jsonb, text, text
) to service_role;

-- Fecha RPCs legados públicos. O trigger handle_new_user continua funcionando.
do $$
begin
  if pg_catalog.to_regprocedure('public.process_kiwify_webhook(text,text,text,text,jsonb)') is not null then
    execute 'revoke execute on function public.process_kiwify_webhook(text,text,text,text,jsonb) from public, anon, authenticated';
  end if;
  if pg_catalog.to_regprocedure('public.handle_new_user()') is not null then
    execute 'revoke execute on function public.handle_new_user() from public, anon, authenticated';
  end if;
end;
$$;

insert into public.cg_credit_plans (
  slug, name, kiwify_checkout_code, credits, price_cents, popular, active
) values
  ('plan_100_brl', 'Plano Profissional IA', '0USJqo5', 2500, 10000, true, true),
  ('plan_micro_10', 'Recarga Rápida', '7fBDYu4', 100, 990, false, true),
  ('plan_growth_25', 'Recarga Intermediária', 'O0ueDhe', 300, 2490, false, true)
on conflict (slug) do update set
  name = excluded.name,
  kiwify_checkout_code = excluded.kiwify_checkout_code,
  credits = excluded.credits,
  price_cents = excluded.price_cents,
  popular = excluded.popular,
  active = excluded.active;

commit;

-- FILA 07: Kiwify Raw Event DLQ, Chargeback Shortfall Lock, Tier Limits, Desktop Fleet Telemetry & Feature Flags
begin;

-- 1. Account review locks & usage tiers on cg_credit_accounts
alter table public.cg_credit_accounts
  add column if not exists review_flag text,
  add column if not exists shortfall_credits integer not null default 0,
  add column if not exists tier text not null default 'standard',
  add column if not exists review_note text;

alter table public.cg_credit_accounts
  drop constraint if exists cg_credit_accounts_tier_check;
alter table public.cg_credit_accounts
  add constraint cg_credit_accounts_tier_check
  check (tier in ('standard', 'vip', 'restricted'));

alter table public.cg_credit_accounts
  drop constraint if exists cg_credit_accounts_balance_nonnegative;
update public.cg_credit_accounts
set shortfall_credits = shortfall_credits + abs(balance),
    balance = 0,
    review_flag = coalesce(review_flag, 'NEGATIVE_BALANCE_REVIEW')
where balance < 0;
alter table public.cg_credit_accounts
  add constraint cg_credit_accounts_balance_nonnegative check (balance >= 0);

-- 2. Kiwify Dead-Letter Queue (DLQ) for failed/transient webhooks & replay audit
create table if not exists public.cg_webhook_dlq (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  webhook_event_type text not null,
  classification text not null check (classification in ('TRANSIENT', 'PERMANENT', 'AUTH')),
  error_message text not null,
  payload jsonb not null default '{}'::jsonb,
  replay_count integer not null default 0,
  replayed_at timestamptz,
  created_at timestamptz not null default pg_catalog.now()
);

create unique index if not exists cg_webhook_dlq_order_event_uidx
  on public.cg_webhook_dlq (order_id, webhook_event_type);

alter table public.cg_webhook_dlq enable row level security;
revoke all on table public.cg_webhook_dlq from public, anon, authenticated;
grant select, insert, update, delete on table public.cg_webhook_dlq to service_role;

-- 3. Dynamic Feature Flags (admin controlled)
create table if not exists public.cg_feature_flags (
  key text primary key,
  global_mode text not null default 'off' check (global_mode in ('off', 'admin_only', 'beta_list', 'all')),
  beta_user_ids text[] not null default '{}',
  description text not null default '',
  updated_at timestamptz not null default pg_catalog.now()
);

alter table public.cg_feature_flags enable row level security;
revoke all on table public.cg_feature_flags from public, anon, authenticated;
grant select, insert, update, delete on table public.cg_feature_flags to service_role;

-- 4. Desktop .exe Fleet Heartbeat Telemetry (strictly anonymous metrics, zero chat text)
create table if not exists public.cg_desktop_fleet (
  machine_id text primary key,
  user_id uuid references auth.users(id) on delete set null,
  app_version text not null,
  os_platform text not null default 'win32',
  webview_phase text not null default 'idle',
  selector_health text not null default 'healthy' check (selector_health in ('healthy', 'degraded', 'offline')),
  last_seen_at timestamptz not null default pg_catalog.now()
);

alter table public.cg_desktop_fleet enable row level security;
revoke all on table public.cg_desktop_fleet from public, anon, authenticated;
grant select, insert, update, delete on table public.cg_desktop_fleet to service_role;

-- 5. Hardened cg_process_kiwify_event with >= 0 floor + NEGATIVE_BALANCE_REVIEW lock
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
  v_prev_balance integer := 0;
  v_shortfall integer := 0;
  v_applied_delta integer := 0;
  v_balance integer := 0;
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
      update public.kiwify_webhooks
      set processing_status = 'needs_review', error_message = 'missing_access_code',
          updated_at = pg_catalog.now()
      where id = v_event.id;
      return jsonb_build_object('success', false, 'status', 'needs_review', 'error', 'missing_access_code');
    end if;

    insert into public.cg_access_codes (
      code_hash, code_masked, credits, max_redemptions, redemption_count,
      status, note, source_order_id
    ) values (
      p_access_code_hash, p_access_code_masked, v_credit_amount, 1, 0,
      'active', 'Kiwify ' || p_order_id, p_order_id
    ) returning id into v_access_code_id;

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

  if v_is_refund and v_user_id is null then
    select * into v_original
    from public.kiwify_webhooks
    where order_id = p_order_id and webhook_event_type in ('order_approved', 'subscription_renewed')
      and processing_status = 'processed'
    order by created_at desc
    limit 1;

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

  select coalesce(balance, 0), coalesce(shortfall_credits, 0)
  into v_prev_balance, v_shortfall
  from public.cg_credit_accounts
  where user_id = v_user_id
  for update;

  v_operation := case
    when p_event_type = 'subscription_renewed' then 'subscription_renewed'
    when p_event_type = 'order_refunded' then 'order_refunded'
    when p_event_type = 'chargeback' then 'chargeback'
    else 'purchase_kiwify'
  end;

  if v_is_approved then
    if v_shortfall > 0 then
      if v_credit_amount >= v_shortfall then
        v_applied_delta := v_credit_amount - v_shortfall;
        v_shortfall := 0;
      else
        v_applied_delta := 0;
        v_shortfall := v_shortfall - v_credit_amount;
      end if;
    else
      v_applied_delta := v_credit_amount;
    end if;

    update public.cg_credit_accounts
    set balance = v_prev_balance + v_applied_delta,
        shortfall_credits = v_shortfall,
        review_flag = case when v_shortfall > 0 then 'NEGATIVE_BALANCE_REVIEW' else null end,
        updated_at = pg_catalog.now()
    where user_id = v_user_id
    returning balance into v_balance;

    v_delta := v_applied_delta;
    v_action := 'account_credited';
  else
    -- Refund / chargeback clamps balance at 0 and records shortfall + NEGATIVE_BALANCE_REVIEW lock
    if v_prev_balance >= v_credit_amount then
      v_applied_delta := -v_credit_amount;
      v_balance := v_prev_balance - v_credit_amount;
    else
      v_applied_delta := -v_prev_balance;
      v_balance := 0;
      v_shortfall := v_shortfall + (v_credit_amount - v_prev_balance);
    end if;

    update public.cg_credit_accounts
    set balance = v_balance,
        shortfall_credits = v_shortfall,
        review_flag = case when v_shortfall > 0 then 'NEGATIVE_BALANCE_REVIEW' else review_flag end,
        review_note = case
          when v_shortfall > 0 then 'Saldo bloqueado após estorno/chargeback acima do saldo disponível.'
          else review_note
        end,
        updated_at = pg_catalog.now()
    where user_id = v_user_id;

    v_delta := v_applied_delta;
    v_action := 'account_debited';
  end if;

  insert into public.cg_credit_ledger (
    user_id, delta, balance_after, operation_type, reference_id, metadata
  ) values (
    v_user_id, v_delta, v_balance, v_operation,
    'kiwify:' || p_order_id || ':' || p_event_type,
    jsonb_build_object(
      'plan_code', p_plan_code,
      'customer_email', v_email,
      'requested_credits', v_credit_amount,
      'shortfall_credits', v_shortfall
    )
  );

  update public.kiwify_webhooks
  set processed = true, processing_status = 'processed', user_id = v_user_id,
      credits_delta = v_delta, processed_at = pg_catalog.now(), updated_at = pg_catalog.now()
  where id = v_event.id;

  return jsonb_build_object(
    'success', true,
    'status', 'processed',
    'action', v_action,
    'credits_delta', v_delta,
    'balance', v_balance,
    'shortfall_credits', v_shortfall,
    'review_flag', case when v_shortfall > 0 then 'NEGATIVE_BALANCE_REVIEW' else null end
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

commit;

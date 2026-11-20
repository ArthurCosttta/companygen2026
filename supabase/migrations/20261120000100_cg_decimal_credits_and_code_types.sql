-- FILA 11: Créditos decimais numeric(12,2), planos 20/55/250 e códigos especiais (invite_only vs user_recharge, máx. 3 por conta)

begin;

-- 1. Converter colunas de crédito/saldo de integer para numeric(12,2)
alter table public.cg_credit_accounts
  alter column balance type numeric(12,2) using balance::numeric(12,2),
  alter column shortfall_credits type numeric(12,2) using coalesce(shortfall_credits, 0)::numeric(12,2);

alter table public.cg_credit_ledger
  alter column delta type numeric(12,2) using delta::numeric(12,2),
  alter column balance_after type numeric(12,2) using balance_after::numeric(12,2);

alter table public.cg_access_codes
  alter column credits type numeric(12,2) using credits::numeric(12,2);

alter table public.cg_credit_plans
  alter column credits type numeric(12,2) using credits::numeric(12,2);

alter table public.cg_payment_orders
  alter column credits type numeric(12,2) using credits::numeric(12,2);

alter table public.kiwify_webhooks
  alter column credits_delta type numeric(12,2) using credits_delta::numeric(12,2);

-- 2. Permitir operation_type = 'recharge_code' no ledger
alter table public.cg_credit_ledger
  drop constraint if exists cg_credit_ledger_operation_type_check;

alter table public.cg_credit_ledger
  add constraint cg_credit_ledger_operation_type_check
  check (operation_type in (
    'welcome_invite', 'recharge_code', 'purchase_kiwify', 'subscription_renewed',
    'order_refunded', 'chargeback', 'whatsapp_reply_consumed',
    'generate_storefront', 'edit_storefront', 'generate_image',
    'failure_refund', 'manual_adjustment'
  ));

-- 3. Enriquecer cg_access_codes com tipo de código e rastreio para o Admin
alter table public.cg_access_codes
  add column if not exists code_type text not null default 'invite_only',
  add column if not exists note text not null default '',
  add column if not exists created_by_email text,
  add column if not exists code_display text,
  add column if not exists last_redeemed_by_email text,
  add column if not exists last_redeemed_at timestamptz;

alter table public.cg_access_codes
  drop constraint if exists cg_access_codes_code_type_check;

alter table public.cg_access_codes
  add constraint cg_access_codes_code_type_check
  check (code_type in ('invite_only', 'user_recharge'));

create index if not exists cg_access_codes_type_status_created_idx
  on public.cg_access_codes (code_type, status, created_at desc);

create index if not exists cg_code_redemptions_user_redeemed_idx
  on public.cg_code_redemptions (user_id, redeemed_at desc);

-- 4. Atualizar planos canônicos em cg_credit_plans (20 / 55 / 250 cr)
update public.cg_credit_plans set credits = 20.00 where slug = 'plan_micro_10' or kiwify_checkout_code = '7fBDYu4';
update public.cg_credit_plans set credits = 55.00 where slug = 'plan_growth_25' or kiwify_checkout_code = 'O0ueDhe';
update public.cg_credit_plans set credits = 250.00 where slug = 'plan_100_brl' or kiwify_checkout_code = '0USJqo5';

-- 5. Recriar RPCs com suporte a numeric(12,2)
drop function if exists public.cg_get_user_credit_balance(uuid);
create or replace function public.cg_get_user_credit_balance(p_user_id uuid)
returns numeric
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_balance numeric(12,2);
begin
  if auth.uid() is distinct from p_user_id
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select balance into v_balance
  from public.cg_credit_accounts
  where user_id = p_user_id;
  return coalesce(v_balance, 0.00);
end;
$$;

revoke all on function public.cg_get_user_credit_balance(uuid) from public, anon, authenticated;
grant execute on function public.cg_get_user_credit_balance(uuid) to authenticated, service_role;

drop function if exists public.cg_debit_credits(uuid, integer, text, text, jsonb);
drop function if exists public.cg_debit_credits(uuid, numeric, text, text, jsonb);
create or replace function public.cg_debit_credits(
  p_user_id uuid,
  p_cost numeric,
  p_operation_type text,
  p_reference_id text,
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.cg_credit_ledger%rowtype;
  v_balance numeric(12,2);
  v_new_balance numeric(12,2);
  v_cost numeric(12,2) := pg_catalog.round(coalesce(p_cost, 0)::numeric, 2);
  v_ref text := nullif(pg_catalog.btrim(coalesce(p_reference_id, '')), '');
begin
  if p_user_id is null then
    raise exception 'user_id required' using errcode = '22023';
  end if;
  if v_cost is null or v_cost <= 0 then
    raise exception 'cost must be positive' using errcode = '22023';
  end if;
  if v_ref is null then
    raise exception 'reference_id required' using errcode = '22023';
  end if;
  if p_operation_type not in (
    'whatsapp_reply_consumed',
    'generate_storefront',
    'edit_storefront',
    'generate_image',
    'manual_adjustment'
  ) then
    raise exception 'invalid debit operation_type: %', p_operation_type using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  select * into v_existing
  from public.cg_credit_ledger
  where reference_id = v_ref
  limit 1;

  if found then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'debited', 0,
      'balance_before', v_existing.balance_after,
      'balance_after', v_existing.balance_after,
      'reference_id', v_existing.reference_id,
      'entry_id', v_existing.id
    );
  end if;

  insert into public.cg_credit_accounts (user_id, balance)
  values (p_user_id, 0.00)
  on conflict (user_id) do nothing;

  select balance into v_balance
  from public.cg_credit_accounts
  where user_id = p_user_id
  for update;

  v_balance := coalesce(v_balance, 0.00);
  if v_balance < v_cost then
    return jsonb_build_object(
      'success', false,
      'status', 402,
      'error', 'INSUFFICIENT_CREDITS',
      'required', v_cost,
      'balance', v_balance
    );
  end if;

  v_new_balance := pg_catalog.round((v_balance - v_cost)::numeric, 2);

  update public.cg_credit_accounts
  set balance = v_new_balance,
      updated_at = pg_catalog.now()
  where user_id = p_user_id;

  insert into public.cg_credit_ledger (
    user_id, delta, balance_after, operation_type, reference_id, metadata
  ) values (
    p_user_id, -v_cost, v_new_balance, p_operation_type, v_ref,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_existing;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'debited', v_cost,
    'balance_before', v_balance,
    'balance_after', v_new_balance,
    'reference_id', v_existing.reference_id,
    'entry_id', v_existing.id
  );
end;
$$;

revoke all on function public.cg_debit_credits(uuid, numeric, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.cg_debit_credits(uuid, numeric, text, text, jsonb) to service_role;

drop function if exists public.cg_refund_credits(uuid, integer, text, text, jsonb);
drop function if exists public.cg_refund_credits(uuid, numeric, text, text, jsonb);
create or replace function public.cg_refund_credits(
  p_user_id uuid,
  p_amount numeric,
  p_reference_id text,
  p_operation_type text default 'failure_refund',
  p_metadata jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.cg_credit_ledger%rowtype;
  v_balance numeric(12,2);
  v_new_balance numeric(12,2);
  v_amount numeric(12,2) := pg_catalog.round(coalesce(p_amount, 0)::numeric, 2);
  v_ref text := nullif(pg_catalog.btrim(coalesce(p_reference_id, '')), '');
begin
  if p_user_id is null then
    raise exception 'user_id required' using errcode = '22023';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'amount must be positive' using errcode = '22023';
  end if;
  if v_ref is null then
    raise exception 'reference_id required' using errcode = '22023';
  end if;
  if p_operation_type not in ('failure_refund', 'manual_adjustment') then
    raise exception 'invalid refund operation_type: %', p_operation_type using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id::text, 0));

  select * into v_existing
  from public.cg_credit_ledger
  where reference_id = v_ref
  limit 1;

  if found then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'refunded', 0,
      'balance_after', v_existing.balance_after,
      'reference_id', v_existing.reference_id,
      'entry_id', v_existing.id
    );
  end if;

  insert into public.cg_credit_accounts (user_id, balance)
  values (p_user_id, 0.00)
  on conflict (user_id) do nothing;

  select balance into v_balance
  from public.cg_credit_accounts
  where user_id = p_user_id
  for update;

  v_balance := coalesce(v_balance, 0.00);
  v_new_balance := pg_catalog.round((v_balance + v_amount)::numeric, 2);

  update public.cg_credit_accounts
  set balance = v_new_balance,
      updated_at = pg_catalog.now()
  where user_id = p_user_id;

  insert into public.cg_credit_ledger (
    user_id, delta, balance_after, operation_type, reference_id, metadata
  ) values (
    p_user_id, v_amount, v_new_balance, p_operation_type, v_ref,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_existing;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'refunded', v_amount,
    'balance_before', v_balance,
    'balance_after', v_new_balance,
    'reference_id', v_existing.reference_id,
    'entry_id', v_existing.id
  );
end;
$$;

revoke all on function public.cg_refund_credits(uuid, numeric, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.cg_refund_credits(uuid, numeric, text, text, jsonb) to service_role;

-- 6. Atualizar cg_redeem_access_code (exclusivo para convite / invite_only)
create or replace function public.cg_redeem_access_code(p_code text, p_ip_hash text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text := '';
  v_code_hash text;
  v_code public.cg_access_codes%rowtype;
  v_new_balance numeric(12,2);
  v_redemption_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select coalesce(email, '') into v_user_email from auth.users where id = v_user_id;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));
  v_code_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.lower(pg_catalog.btrim(p_code)), 'sha256'), 'hex'
  );

  select * into v_code
  from public.cg_access_codes
  where code_hash = v_code_hash
  for update;

  if not found then return jsonb_build_object('success', false, 'error', 'invalid_code'); end if;
  if coalesce(v_code.code_type, 'invite_only') = 'user_recharge' then
    return jsonb_build_object('success', false, 'error', 'recharge_code_use_settings');
  end if;
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
      status = case when redemption_count + 1 >= max_redemptions then 'depleted' else status end,
      last_redeemed_by_email = nullif(v_user_email, ''),
      last_redeemed_at = pg_catalog.now()
  where id = v_code.id;

  insert into public.cg_credit_accounts (user_id, balance)
  values (v_user_id, 0.00)
  on conflict (user_id) do nothing;

  update public.cg_credit_accounts
  set balance = pg_catalog.round((balance + v_code.credits)::numeric, 2),
      updated_at = pg_catalog.now()
  where user_id = v_user_id
  returning balance into v_new_balance;

  insert into public.cg_credit_ledger (
    user_id, delta, balance_after, operation_type, reference_id, metadata
  ) values (
    v_user_id, v_code.credits, v_new_balance, 'welcome_invite',
    'access-code:' || v_code.id::text || ':' || v_user_id::text,
    jsonb_build_object('code_masked', v_code.code_masked, 'redemption_id', v_redemption_id, 'code_type', 'invite_only')
  );

  return jsonb_build_object(
    'success', true, 'credits_added', v_code.credits,
    'new_balance', v_new_balance, 'code_masked', v_code.code_masked
  );
end;
$$;

revoke all on function public.cg_redeem_access_code(text, text) from public, anon, authenticated;
grant execute on function public.cg_redeem_access_code(text, text) to authenticated;

-- 7. Nova RPC: cg_redeem_recharge_code (usuário existente, máx. 3 resgates por conta)
create or replace function public.cg_redeem_recharge_code(p_code text, p_ip_hash text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_user_email text := '';
  v_code_hash text;
  v_code public.cg_access_codes%rowtype;
  v_used_count integer := 0;
  v_new_balance numeric(12,2);
  v_redemption_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select coalesce(email, '') into v_user_email from auth.users where id = v_user_id;

  -- Trava por usuário elimina TOCTOU em 4 requisições simultâneas
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));

  v_code_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.lower(pg_catalog.btrim(coalesce(p_code, ''))), 'sha256'), 'hex'
  );

  select * into v_code
  from public.cg_access_codes
  where code_hash = v_code_hash
  for update;

  if not found then
    return jsonb_build_object('success', false, 'error', 'invalid_code');
  end if;
  if coalesce(v_code.code_type, 'invite_only') <> 'user_recharge' then
    return jsonb_build_object('success', false, 'error', 'invite_only_code');
  end if;
  if v_code.status <> 'active' then
    return jsonb_build_object('success', false, 'error', 'inactive_code');
  end if;
  if v_code.expires_at is not null and pg_catalog.now() > v_code.expires_at then
    update public.cg_access_codes set status = 'expired' where id = v_code.id;
    return jsonb_build_object('success', false, 'error', 'expired_code');
  end if;
  if v_code.redemption_count >= v_code.max_redemptions then
    update public.cg_access_codes set status = 'depleted' where id = v_code.id;
    return jsonb_build_object('success', false, 'error', 'depleted_code');
  end if;

  select count(*)::integer into v_used_count
  from public.cg_code_redemptions r
  join public.cg_access_codes c on c.id = r.code_id
  where r.user_id = v_user_id
    and c.code_type = 'user_recharge';

  if v_used_count >= 3 then
    return jsonb_build_object(
      'success', false,
      'error', 'recharge_limit_reached',
      'limit', 3,
      'used', v_used_count
    );
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
      status = case when redemption_count + 1 >= max_redemptions then 'depleted' else status end,
      last_redeemed_by_email = nullif(v_user_email, ''),
      last_redeemed_at = pg_catalog.now()
  where id = v_code.id;

  insert into public.cg_credit_accounts (user_id, balance)
  values (v_user_id, 0.00)
  on conflict (user_id) do nothing;

  update public.cg_credit_accounts
  set balance = pg_catalog.round((balance + v_code.credits)::numeric, 2),
      updated_at = pg_catalog.now()
  where user_id = v_user_id
  returning balance into v_new_balance;

  insert into public.cg_credit_ledger (
    user_id, delta, balance_after, operation_type, reference_id, metadata
  ) values (
    v_user_id, v_code.credits, v_new_balance, 'recharge_code',
    'recharge-code:' || v_code.id::text || ':' || v_user_id::text,
    jsonb_build_object('code_masked', v_code.code_masked, 'redemption_id', v_redemption_id, 'code_type', 'user_recharge')
  );

  return jsonb_build_object(
    'success', true,
    'credits_added', v_code.credits,
    'new_balance', v_new_balance,
    'code_masked', v_code.code_masked,
    'redemptions_used', v_used_count + 1,
    'redemptions_remaining', greatest(0, 3 - (v_used_count + 1)),
    'limit', 3
  );
end;
$$;

revoke all on function public.cg_redeem_recharge_code(text, text) from public, anon, authenticated;
grant execute on function public.cg_redeem_recharge_code(text, text) to authenticated;

-- 8. Quota de resgates do usuário logado
create or replace function public.cg_get_recharge_redemption_quota(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_used integer := 0;
begin
  if auth.uid() is distinct from p_user_id
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'not allowed' using errcode = '42501';
  end if;

  select count(*)::integer into v_used
  from public.cg_code_redemptions r
  join public.cg_access_codes c on c.id = r.code_id
  where r.user_id = p_user_id
    and c.code_type = 'user_recharge';

  return jsonb_build_object(
    'used', v_used,
    'limit', 3,
    'remaining', greatest(0, 3 - v_used)
  );
end;
$$;

revoke all on function public.cg_get_recharge_redemption_quota(uuid) from public, anon, authenticated;
grant execute on function public.cg_get_recharge_redemption_quota(uuid) to authenticated, service_role;

-- 9. Recriar cg_process_kiwify_event com p_credits numeric
drop function if exists public.cg_process_kiwify_event(text, text, text, text, text, text, integer, jsonb, text, text);
drop function if exists public.cg_process_kiwify_event(text, text, text, text, text, text, numeric, jsonb, text, text);
create or replace function public.cg_process_kiwify_event(
  p_order_id text,
  p_event_type text,
  p_order_status text,
  p_customer_email text,
  p_customer_phone text,
  p_plan_code text,
  p_credits numeric,
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
  v_delta numeric(12,2);
  v_prev_balance numeric(12,2) := 0.00;
  v_shortfall numeric(12,2) := 0.00;
  v_applied_delta numeric(12,2) := 0.00;
  v_balance numeric(12,2) := 0.00;
  v_operation text;
  v_action text;
  v_credit_amount numeric(12,2) := pg_catalog.round(coalesce(p_credits, 0)::numeric, 2);
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
      status, code_type, note, purchaser_email, source_order_id, source_event_type
    ) values (
      p_access_code_hash, p_access_code_masked, v_credit_amount, 1, 0,
      'active', 'invite_only', 'Kiwify ' || p_order_id, nullif(v_email, ''), p_order_id, p_event_type
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
  values (v_user_id, 0.00)
  on conflict (user_id) do nothing;

  select coalesce(balance, 0.00), coalesce(shortfall_credits, 0.00)
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
        v_applied_delta := pg_catalog.round((v_credit_amount - v_shortfall)::numeric, 2);
        v_shortfall := 0.00;
      else
        v_applied_delta := 0.00;
        v_shortfall := pg_catalog.round((v_shortfall - v_credit_amount)::numeric, 2);
      end if;
    else
      v_applied_delta := v_credit_amount;
    end if;

    update public.cg_credit_accounts
    set balance = pg_catalog.round((v_prev_balance + v_applied_delta)::numeric, 2),
        shortfall_credits = v_shortfall,
        review_flag = case when v_shortfall > 0 then 'NEGATIVE_BALANCE_REVIEW' else null end,
        updated_at = pg_catalog.now()
    where user_id = v_user_id
    returning balance into v_balance;

    v_delta := v_applied_delta;
    v_action := 'account_credited';
  else
    if v_prev_balance >= v_credit_amount then
      v_applied_delta := -v_credit_amount;
      v_balance := pg_catalog.round((v_prev_balance - v_credit_amount)::numeric, 2);
    else
      v_applied_delta := -v_prev_balance;
      v_balance := 0.00;
      v_shortfall := pg_catalog.round((v_shortfall + (v_credit_amount - v_prev_balance))::numeric, 2);
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

  if v_delta <> 0 then
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
  end if;

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
  text, text, text, text, text, text, numeric, jsonb, text, text
) from public, anon, authenticated;
grant execute on function public.cg_process_kiwify_event(
  text, text, text, text, text, text, numeric, jsonb, text, text
) to service_role;

commit;

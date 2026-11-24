-- Wave 1: Garante que TODA compra aprovada/renovada na Kiwify gere 1 código AI10-XXXX-XXXX
-- resgatável no onboarding (/?route=access) OU em Ajustes -> Resgatar Código (sem teto de 3 promoções).
-- Créditos são concedidos SOMENTE no momento do resgate do código (zero double-crediting).

begin;

-- 1. Permitir code_type = 'kiwify_purchase' em cg_access_codes
alter table public.cg_access_codes
  drop constraint if exists cg_access_codes_code_type_check;

alter table public.cg_access_codes
  add constraint cg_access_codes_code_type_check
  check (code_type in ('invite_only', 'user_recharge', 'kiwify_purchase'));

-- 2. Tabela service-role-only para rastrear e permitir busca segura (email + order_id) de códigos gerados pela Kiwify
create table if not exists public.cg_kiwify_purchase_codes (
  id uuid primary key default gen_random_uuid(),
  order_id text not null,
  webhook_event_type text not null,
  access_code_id uuid not null references public.cg_access_codes(id) on delete cascade,
  buyer_email text not null,
  code_plain text,
  code_masked text not null,
  credits numeric(12,2) not null,
  plan_code text,
  created_at timestamptz not null default pg_catalog.now(),
  constraint cg_kiwify_purchase_codes_order_event_key unique (order_id, webhook_event_type)
);

create index if not exists cg_kiwify_purchase_codes_email_order_idx
  on public.cg_kiwify_purchase_codes (pg_catalog.lower(buyer_email), order_id);

create index if not exists cg_kiwify_purchase_codes_access_code_idx
  on public.cg_kiwify_purchase_codes (access_code_id);

alter table public.cg_kiwify_purchase_codes enable row level security;
revoke all on public.cg_kiwify_purchase_codes from public, anon, authenticated;
grant all on public.cg_kiwify_purchase_codes to service_role;

drop policy if exists "Service role full access cg_kiwify_purchase_codes" on public.cg_kiwify_purchase_codes;
create policy "Service role full access cg_kiwify_purchase_codes"
  on public.cg_kiwify_purchase_codes
  for all
  to service_role
  using (true)
  with check (true);

-- 3. Recriar cg_process_kiwify_event para SEMPRE gerar 1 código em compras/renovações aprovadas
drop function if exists public.cg_process_kiwify_event(text, text, text, text, text, text, numeric, jsonb, text, text);
drop function if exists public.cg_process_kiwify_event(text, text, text, text, text, text, numeric, jsonb, text, text, text);

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
  p_access_code_masked text default null,
  p_access_code_plain text default null
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

  -- SEMPRE gera 1 código de acesso único para toda compra/renovação aprovada (mesmo que o comprador já tenha conta)
  if v_is_approved then
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
      'active', 'kiwify_purchase', 'Kiwify ' || p_order_id, nullif(v_email, ''), p_order_id, p_event_type
    ) returning id into v_access_code_id;

    insert into public.cg_kiwify_purchase_codes (
      order_id, webhook_event_type, access_code_id, buyer_email,
      code_plain, code_masked, credits, plan_code
    ) values (
      p_order_id, p_event_type, v_access_code_id, v_email,
      nullif(pg_catalog.btrim(coalesce(p_access_code_plain, '')), ''),
      p_access_code_masked, v_credit_amount, p_plan_code
    )
    on conflict (order_id, webhook_event_type) do update
    set access_code_id = excluded.access_code_id,
        buyer_email = excluded.buyer_email,
        code_plain = excluded.code_plain,
        code_masked = excluded.code_masked,
        credits = excluded.credits,
        plan_code = excluded.plan_code;

    update public.kiwify_webhooks
    set processed = true, processing_status = 'processed',
        access_code_id = v_access_code_id, user_id = v_user_id,
        credits_delta = v_credit_amount,
        processed_at = pg_catalog.now(), updated_at = pg_catalog.now()
    where id = v_event.id;

    return jsonb_build_object(
      'success', true,
      'status', 'processed',
      'action', 'access_code_created',
      'user_exists', (v_user_id is not null),
      'credits_delta', v_credit_amount,
      'balance', null,
      'code_masked', p_access_code_masked
    );
  end if;

  -- Fluxo de estorno / chargeback: verifica se o código da compra foi resgatado; se não, apenas revoga o código
  select * into v_original
  from public.kiwify_webhooks
  where order_id = p_order_id
    and webhook_event_type in ('order_approved', 'subscription_renewed')
    and processing_status = 'processed'
  order by created_at desc
  limit 1;

  if found and v_original.access_code_id is not null then
    select user_id into v_redeemed_user_id
    from public.cg_code_redemptions
    where code_id = v_original.access_code_id
    order by redeemed_at
    limit 1;

    if v_redeemed_user_id is null then
      update public.cg_access_codes
      set status = 'revoked'
      where id = v_original.access_code_id and status = 'active';

      update public.cg_kiwify_purchase_codes
      set code_plain = null
      where access_code_id = v_original.access_code_id;

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
  elsif found and v_original.user_id is not null then
    v_user_id := v_original.user_id;
  end if;

  if v_user_id is null then
    update public.kiwify_webhooks
    set processing_status = 'needs_review', error_message = 'original_credit_not_found',
        updated_at = pg_catalog.now()
    where id = v_event.id;
    return jsonb_build_object('success', false, 'status', 'needs_review', 'error', 'original_credit_not_found');
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
    when p_event_type = 'order_refunded' then 'order_refunded'
    else 'chargeback'
  end;

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

revoke all on function public.cg_process_kiwify_event(text, text, text, text, text, text, numeric, jsonb, text, text, text) from public, anon, authenticated;
grant execute on function public.cg_process_kiwify_event(text, text, text, text, text, text, numeric, jsonb, text, text, text) to service_role;

-- 4. Atualizar cg_redeem_access_code para aceitar invite_only E kiwify_purchase
create or replace function public.cg_redeem_access_code(
  p_code text,
  p_ip_hash text default null
)
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
  v_code_type text;
  v_new_balance numeric(12,2);
  v_redemption_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select coalesce(email, '') into v_user_email from auth.users where id = v_user_id;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user_id::text, 0));
  v_code_hash := pg_catalog.encode(
    extensions.digest(pg_catalog.lower(pg_catalog.btrim(coalesce(p_code, ''))), 'sha256'), 'hex'
  );

  select * into v_code
  from public.cg_access_codes
  where code_hash = v_code_hash
  for update;

  if not found then return jsonb_build_object('success', false, 'error', 'invalid_code'); end if;
  v_code_type := coalesce(v_code.code_type, 'invite_only');
  if v_code_type = 'user_recharge' then
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

  if v_code_type = 'kiwify_purchase' then
    update public.cg_kiwify_purchase_codes
    set code_plain = null
    where access_code_id = v_code.id;
  end if;

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
    v_user_id,
    v_code.credits,
    v_new_balance,
    case when v_code_type = 'kiwify_purchase' then 'purchase_kiwify' else 'welcome_invite' end,
    case when v_code_type = 'kiwify_purchase'
      then 'kiwify-code:' || v_code.id::text || ':' || v_user_id::text
      else 'access-code:' || v_code.id::text || ':' || v_user_id::text
    end,
    jsonb_build_object(
      'code_masked', v_code.code_masked,
      'redemption_id', v_redemption_id,
      'code_type', v_code_type,
      'source_order_id', v_code.source_order_id
    )
  );

  return jsonb_build_object(
    'success', true,
    'credits_added', v_code.credits,
    'new_balance', v_new_balance,
    'code_masked', v_code.code_masked,
    'code_type', v_code_type
  );
end;
$$;

revoke all on function public.cg_redeem_access_code(text, text) from public, anon;
grant execute on function public.cg_redeem_access_code(text, text) to authenticated, service_role;

-- 5. Atualizar cg_redeem_recharge_code para aceitar user_recharge (com teto de 3) E kiwify_purchase (sem teto de 3)
create or replace function public.cg_redeem_recharge_code(
  p_code text,
  p_ip_hash text default null
)
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
  v_code_type text;
  v_used_count integer := 0;
  v_new_balance numeric(12,2);
  v_redemption_id uuid;
begin
  if v_user_id is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select coalesce(email, '') into v_user_email from auth.users where id = v_user_id;

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

  v_code_type := coalesce(v_code.code_type, 'invite_only');
  if v_code_type not in ('user_recharge', 'kiwify_purchase') then
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

  -- Apenas códigos promocionais 'user_recharge' possuem teto de 3 por conta; compras Kiwify pagas são ilimitadas
  if v_code_type = 'user_recharge' and v_used_count >= 3 then
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

  if v_code_type = 'kiwify_purchase' then
    update public.cg_kiwify_purchase_codes
    set code_plain = null
    where access_code_id = v_code.id;
  end if;

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
    v_user_id,
    v_code.credits,
    v_new_balance,
    case when v_code_type = 'kiwify_purchase' then 'purchase_kiwify' else 'recharge_code' end,
    case when v_code_type = 'kiwify_purchase'
      then 'kiwify-code:' || v_code.id::text || ':' || v_user_id::text
      else 'recharge-code:' || v_code.id::text || ':' || v_user_id::text
    end,
    jsonb_build_object(
      'code_masked', v_code.code_masked,
      'redemption_id', v_redemption_id,
      'code_type', v_code_type,
      'source_order_id', v_code.source_order_id
    )
  );

  return jsonb_build_object(
    'success', true,
    'credits_added', v_code.credits,
    'new_balance', v_new_balance,
    'code_masked', v_code.code_masked,
    'code_type', v_code_type,
    'redemptions_used', case when v_code_type = 'user_recharge' then v_used_count + 1 else v_used_count end,
    'redemptions_remaining', greatest(0, 3 - (case when v_code_type = 'user_recharge' then v_used_count + 1 else v_used_count end)),
    'limit', 3
  );
end;
$$;

revoke all on function public.cg_redeem_recharge_code(text, text) from public, anon;
grant execute on function public.cg_redeem_recharge_code(text, text) to authenticated, service_role;

commit;

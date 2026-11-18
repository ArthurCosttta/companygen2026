-- Fase 3 (F3-BANCO-03): RPCs atômicas de consumo e estorno de créditos no app,
-- bloqueio completo de leitura pública em kiwify_webhooks e índices das FKs.

begin;

create or replace function public.cg_debit_credits(
  p_user_id uuid,
  p_cost integer,
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
  v_balance integer;
  v_new_balance integer;
  v_ref text := nullif(pg_catalog.btrim(coalesce(p_reference_id, '')), '');
begin
  if p_user_id is null then
    raise exception 'user_id required' using errcode = '22023';
  end if;
  if p_cost is null or p_cost <= 0 then
    raise exception 'cost must be positive' using errcode = '22023';
  end if;
  if v_ref is null then
    raise exception 'reference_id required' using errcode = '22023';
  end if;
  if p_operation_type not in (
    'whatsapp_reply_consumed',
    'generate_storefront',
    'edit_storefront',
    'generate_image'
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
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select balance into v_balance
  from public.cg_credit_accounts
  where user_id = p_user_id
  for update;

  v_balance := coalesce(v_balance, 0);
  if v_balance < p_cost then
    return jsonb_build_object(
      'success', false,
      'status', 402,
      'error', 'INSUFFICIENT_CREDITS',
      'required', p_cost,
      'balance', v_balance
    );
  end if;

  v_new_balance := v_balance - p_cost;

  update public.cg_credit_accounts
  set balance = v_new_balance,
      updated_at = pg_catalog.now()
  where user_id = p_user_id;

  insert into public.cg_credit_ledger (
    user_id, delta, balance_after, operation_type, reference_id, metadata
  ) values (
    p_user_id, -p_cost, v_new_balance, p_operation_type, v_ref,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_existing;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'debited', p_cost,
    'balance_before', v_balance,
    'balance_after', v_new_balance,
    'reference_id', v_existing.reference_id,
    'entry_id', v_existing.id
  );
end;
$$;

create or replace function public.cg_refund_credits(
  p_user_id uuid,
  p_amount integer,
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
  v_balance integer;
  v_new_balance integer;
  v_ref text := nullif(pg_catalog.btrim(coalesce(p_reference_id, '')), '');
begin
  if p_user_id is null then
    raise exception 'user_id required' using errcode = '22023';
  end if;
  if p_amount is null or p_amount <= 0 then
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
  values (p_user_id, 0)
  on conflict (user_id) do nothing;

  select balance into v_balance
  from public.cg_credit_accounts
  where user_id = p_user_id
  for update;

  v_balance := coalesce(v_balance, 0);
  v_new_balance := v_balance + p_amount;

  update public.cg_credit_accounts
  set balance = v_new_balance,
      updated_at = pg_catalog.now()
  where user_id = p_user_id;

  insert into public.cg_credit_ledger (
    user_id, delta, balance_after, operation_type, reference_id, metadata
  ) values (
    p_user_id, p_amount, v_new_balance, p_operation_type, v_ref,
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning * into v_existing;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'refunded', p_amount,
    'balance_before', v_balance,
    'balance_after', v_new_balance,
    'reference_id', v_existing.reference_id,
    'entry_id', v_existing.id
  );
end;
$$;

revoke all on function public.cg_debit_credits(uuid, integer, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.cg_debit_credits(uuid, integer, text, text, jsonb) to service_role;

revoke all on function public.cg_refund_credits(uuid, integer, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.cg_refund_credits(uuid, integer, text, text, jsonb) to service_role;

revoke all on table public.kiwify_webhooks from public, anon, authenticated;

create index if not exists cg_access_codes_created_by_idx on public.cg_access_codes (created_by);
create index if not exists cg_code_redemptions_user_id_idx on public.cg_code_redemptions (user_id);
create index if not exists cg_payment_orders_plan_id_idx on public.cg_payment_orders (plan_id);
create index if not exists cg_payment_orders_user_id_idx on public.cg_payment_orders (user_id);
create index if not exists kiwify_webhooks_user_id_idx on public.kiwify_webhooks (user_id);
create index if not exists kiwify_webhooks_access_code_id_idx on public.kiwify_webhooks (access_code_id);

commit;

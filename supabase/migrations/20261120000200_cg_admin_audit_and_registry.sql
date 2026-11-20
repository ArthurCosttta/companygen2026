-- FILA 12: Auditoria administrativa e registry persistentes no Supabase (fim da perda de estado no disco efêmero do Cloud Run)

create table if not exists public.cg_admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  action text not null,
  target_user_id uuid,
  actor text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists cg_admin_audit_log_created_idx
  on public.cg_admin_audit_log (created_at desc);

create table if not exists public.cg_admin_registry (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.cg_admin_audit_log enable row level security;
alter table public.cg_admin_audit_log force row level security;
alter table public.cg_admin_registry enable row level security;
alter table public.cg_admin_registry force row level security;

revoke all on table public.cg_admin_audit_log from public, anon, authenticated;
revoke all on table public.cg_admin_registry from public, anon, authenticated;
grant select, insert, update, delete on table public.cg_admin_audit_log to service_role;
grant select, insert, update, delete on table public.cg_admin_registry to service_role;

-- Fase 4: Suporte/Tickets do Cliente, Campanhas QR Code nomeadas e Bucket Storage persistente

create table if not exists public.cg_support_tickets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  user_email text not null default '',
  store_name text not null default '',
  category text not null default 'outro'
    check (category in ('vitrine', 'whatsapp', 'creditos', 'outro')),
  subject text not null,
  description text not null,
  context_meta jsonb not null default '{}'::jsonb
    check (jsonb_typeof(context_meta) = 'object'),
  status text not null default 'open'
    check (status in ('open', 'in_progress', 'resolved')),
  admin_note text not null default '',
  resolved_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cg_support_tickets_user_created
  on public.cg_support_tickets (user_id, created_at desc);

create index if not exists idx_cg_support_tickets_status_created
  on public.cg_support_tickets (status, created_at desc);

alter table public.cg_support_tickets enable row level security;

drop policy if exists "cg_support_tickets_select_own" on public.cg_support_tickets;
create policy "cg_support_tickets_select_own"
  on public.cg_support_tickets
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "cg_support_tickets_insert_own" on public.cg_support_tickets;
create policy "cg_support_tickets_insert_own"
  on public.cg_support_tickets
  for insert
  to authenticated
  with check (user_id = (select auth.uid()));

create table if not exists public.cg_qr_campaigns (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique
    check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null,
  target_url text not null,
  scans_count bigint not null default 0 check (scans_count >= 0),
  active boolean not null default true,
  created_by text not null default 'admin',
  last_scanned_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_cg_qr_campaigns_active_created
  on public.cg_qr_campaigns (active, created_at desc);

alter table public.cg_qr_campaigns enable row level security;

create or replace function public.cg_increment_qr_scan(p_slug text)
returns table (
  id uuid,
  slug text,
  name text,
  target_url text,
  scans_count bigint
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  return query
  update public.cg_qr_campaigns c
     set scans_count = c.scans_count + 1,
         last_scanned_at = now(),
         updated_at = now()
   where c.slug = lower(trim(coalesce(p_slug, '')))
     and c.active = true
  returning c.id, c.slug, c.name, c.target_url, c.scans_count;
end;
$$;

revoke all on function public.cg_increment_qr_scan(text) from public, anon, authenticated;
grant execute on function public.cg_increment_qr_scan(text) to service_role;

insert into storage.buckets (id, name, public)
values ('cg-storefronts', 'cg-storefronts', false)
on conflict (id) do nothing;

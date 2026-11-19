-- Additive migration for CompanyGen onboarding 1-click thermometer feedback (FILA 02 · C20)

create table if not exists public.cg_onboarding_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  rating text not null check (rating in ('easy', 'medium', 'stuck')),
  step_stopped integer,
  comment text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_cg_onboarding_feedback_created_at
  on public.cg_onboarding_feedback (created_at desc);

alter table public.cg_onboarding_feedback enable row level security;

drop policy if exists "cg_onboarding_feedback_insert_own" on public.cg_onboarding_feedback;
create policy "cg_onboarding_feedback_insert_own"
  on public.cg_onboarding_feedback
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "cg_onboarding_feedback_select_own" on public.cg_onboarding_feedback;
create policy "cg_onboarding_feedback_select_own"
  on public.cg_onboarding_feedback
  for select
  to authenticated
  using (auth.uid() = user_id);

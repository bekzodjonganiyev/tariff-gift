-- ===========================================================================
-- setup.sql — consolidated, one-shot schema for the Tariff Gift Approval App.
--
-- This is the SQUASHED equivalent of migrations 0001 + 0002 + 0003: running it
-- once builds the full final-state schema, RLS, triggers and the admin
-- bootstrap. Use it for a clean "fresh start" — e.g. right after reset.sql —
-- instead of pasting the three migration files in order.
--
-- The numbered files in migrations/ stay as the version-control history; this
-- file is purely a convenience for rebuilding from zero.
--
-- Idempotent: every statement guards with `if not exists` / `or replace`, so it
-- is safe to run on a fresh OR an already-provisioned database.
-- ===========================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles — one row per auth user, auto-created on sign-up.
-- `role` mirrors the JWT app_metadata.role for convenience; authorization is
-- still enforced from the JWT (see proxy.ts), never from this column.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  email      text,
  role       text not null default 'user',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- tariffs — admin-created plans shown on the home page.
-- ---------------------------------------------------------------------------
create table if not exists public.tariffs (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  price         numeric(12, 2) not null default 0,
  period_months integer not null check (period_months between 1 and 12),
  is_active     boolean not null default true,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- purchases — mock "buy a tariff" records (payment is mocked).
-- ---------------------------------------------------------------------------
create table if not exists public.purchases (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  tariff_id  uuid not null references public.tariffs (id) on delete cascade,
  amount     numeric(12, 2) not null default 0,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- gift_applications — a user's request for a gift on a tariff.
--   status: pending → approved | rejected
--   on approve: activation_code is set + e-mailed to the user
--   on activate: is_activated = true, activated_at/expires_at filled in
-- ---------------------------------------------------------------------------
create table if not exists public.gift_applications (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  tariff_id       uuid not null references public.tariffs (id) on delete cascade,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  activation_code text,
  is_activated    boolean not null default false,
  applicant_email text,
  activated_at    timestamptz,
  expires_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Safety net for an older table that predates the extra columns.
alter table public.gift_applications
  add column if not exists applicant_email text,
  add column if not exists activated_at    timestamptz,
  add column if not exists expires_at       timestamptz;

-- At most one *pending* application per user (backs the app-level check).
create unique index if not exists gift_applications_one_pending_per_user
  on public.gift_applications (user_id)
  where status = 'pending';

-- ---------------------------------------------------------------------------
-- telegram_config — single-row table holding the bot token + admin chat id.
-- Secrets: never exposed via RLS, only read with the service-role key.
-- ---------------------------------------------------------------------------
create table if not exists public.telegram_config (
  id                integer primary key default 1,
  bot_token         text,
  admin_telegram_id text,
  updated_at        timestamptz not null default now(),
  constraint telegram_config_singleton check (id = 1)
);
insert into public.telegram_config (id) values (1) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- telegram_candidates — everyone who presses /start. The admin promotes one of
-- them to approver (writes telegram_config.admin_telegram_id) from the panel.
-- ---------------------------------------------------------------------------
create table if not exists public.telegram_candidates (
  telegram_id text primary key,
  first_name  text,
  last_name   text,
  username    text,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- telegram_logs — audit trail of notification / approval events, including
-- which Telegram account performed each approve/reject.
-- ---------------------------------------------------------------------------
create table if not exists public.telegram_logs (
  id                uuid primary key default gen_random_uuid(),
  application_id    uuid references public.gift_applications (id) on delete set null,
  actor_telegram_id text,
  action            text, -- 'notify' | 'approve' | 'reject'
  status            text not null,
  error_message     text,
  created_at        timestamptz not null default now()
);

-- Safety net for an older table that predates these columns.
alter table public.telegram_logs
  add column if not exists actor_telegram_id text,
  add column if not exists action            text;

-- ===========================================================================
-- Triggers on auth.users
-- ===========================================================================

-- BEFORE INSERT: frictionless sign-up + admin bootstrap.
--   * Email/password sign-ups are auto-confirmed (no e-mail step). Pair with
--     dashboard: Authentication → Providers → Email → "Confirm email" OFF.
--   * The first THREE e-mail sign-ups become admins; the role is written into
--     raw_app_meta_data so it is on the JWT (app_metadata.role) from the very
--     first access token. Google / OAuth users are always regular users.
create or replace function public.bootstrap_admin_on_signup()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  admin_count integer;
begin
  if coalesce(new.raw_app_meta_data ->> 'provider', '') = 'email' then
    if new.email_confirmed_at is null then
      new.email_confirmed_at = now();
    end if;

    select count(*) into admin_count
    from auth.users
    where raw_app_meta_data ->> 'role' = 'admin';

    if admin_count < 3 then
      new.raw_app_meta_data =
        coalesce(new.raw_app_meta_data, '{}'::jsonb)
        || jsonb_build_object('role', 'admin');
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_bootstrap_admin on auth.users;
create trigger on_auth_user_bootstrap_admin
  before insert on auth.users
  for each row execute function public.bootstrap_admin_on_signup();

-- AFTER INSERT: mirror the new user into public.profiles (reads the role the
-- BEFORE trigger just set, so admins land in profiles with role='admin').
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_app_meta_data ->> 'role', 'user')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill profiles for any users created before the trigger existed.
insert into public.profiles (id, email, role)
select u.id, u.email, coalesce(u.raw_app_meta_data ->> 'role', 'user')
from auth.users u
on conflict (id) do nothing;

-- Keep gift_applications.updated_at fresh on any update.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists gift_applications_touch on public.gift_applications;
create trigger gift_applications_touch
  before update on public.gift_applications
  for each row execute function public.touch_updated_at();

-- ===========================================================================
-- Row Level Security
-- ===========================================================================
alter table public.profiles            enable row level security;
alter table public.tariffs             enable row level security;
alter table public.purchases           enable row level security;
alter table public.gift_applications   enable row level security;
alter table public.telegram_config     enable row level security;
alter table public.telegram_candidates enable row level security;
alter table public.telegram_logs       enable row level security;

-- Helper: is the current JWT an admin? (app_metadata.role = 'admin')
create or replace function public.is_admin()
returns boolean language sql stable as $$
  select coalesce(
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin',
    false
  );
$$;

-- profiles: a user can read their own row; admins can read all.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

-- tariffs: anyone can read ACTIVE tariffs; admins read/write everything.
drop policy if exists "tariffs_select_active" on public.tariffs;
create policy "tariffs_select_active" on public.tariffs
  for select using (is_active = true or public.is_admin());

drop policy if exists "tariffs_admin_write" on public.tariffs;
create policy "tariffs_admin_write" on public.tariffs
  for all using (public.is_admin()) with check (public.is_admin());

-- purchases: a user sees / creates only their own.
drop policy if exists "purchases_select_own" on public.purchases;
create policy "purchases_select_own" on public.purchases
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "purchases_insert_own" on public.purchases;
create policy "purchases_insert_own" on public.purchases
  for insert with check (user_id = auth.uid());

-- gift_applications: a user sees / creates only their own. Status transitions
-- (approve/reject/activate) run server-side with the service-role key, so no
-- user UPDATE policy is granted.
drop policy if exists "gift_applications_select_own" on public.gift_applications;
create policy "gift_applications_select_own" on public.gift_applications
  for select using (user_id = auth.uid() or public.is_admin());

drop policy if exists "gift_applications_insert_own" on public.gift_applications;
create policy "gift_applications_insert_own" on public.gift_applications
  for insert with check (user_id = auth.uid());

-- telegram_config / telegram_candidates / telegram_logs: no policies → only the
-- service-role key (which bypasses RLS) can touch them. Secrets stay server-side.

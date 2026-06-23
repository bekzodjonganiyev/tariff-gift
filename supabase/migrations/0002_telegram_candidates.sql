-- ===========================================================================
-- Telegram approver selection.
--
-- The first version of the app auto-bound whoever pressed /start first as THE
-- approver, so the admin had no control over who could approve/reject gifts.
--
-- This migration records EVERY person who presses /start in
-- `telegram_candidates`; the admin then explicitly promotes one of them to
-- approver from the admin panel (writes telegram_config.admin_telegram_id).
--
-- Idempotent — safe to run more than once.
-- ===========================================================================

create table if not exists public.telegram_candidates (
  telegram_id text primary key,
  first_name  text,
  last_name   text,
  username    text,
  created_at  timestamptz not null default now(),
  last_seen   timestamptz not null default now()
);

-- Service-role-only, like telegram_config / telegram_logs: enable RLS and grant
-- no policies, so end users can never read the list of Telegram accounts.
alter table public.telegram_candidates enable row level security;

-- ---------------------------------------------------------------------------
-- telegram_logs: record which Telegram account performed an approve/reject so
-- the audit history can show "who pressed the button". No-op if it exists.
-- ---------------------------------------------------------------------------
alter table public.telegram_logs
  add column if not exists actor_telegram_id text,
  add column if not exists action            text; -- 'notify' | 'approve' | 'reject'

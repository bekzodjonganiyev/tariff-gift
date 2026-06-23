-- ===========================================================================
-- DESTRUCTIVE RESET — wipes ALL Tariff Gift app schema + data.
--
-- Run this in Supabase Dashboard → SQL Editor to get a clean slate, then run
-- migrations 0001 and 0002 again to rebuild. Use this to validate that the
-- project runs against a fresh database (a task requirement).
--
-- This does NOT touch any Supabase internals — only this app's objects.
-- ===========================================================================

-- 1. Trigger on auth.users + its function (created by 0001).
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user() cascade;

-- 2. App tables. `cascade` also drops their policies, indexes, FKs and triggers.
drop table if exists public.telegram_logs        cascade;
drop table if exists public.telegram_candidates  cascade;
drop table if exists public.telegram_config      cascade;
drop table if exists public.gift_applications    cascade;
drop table if exists public.purchases            cascade;
drop table if exists public.tariffs              cascade;
drop table if exists public.profiles             cascade;

-- 3. Helper functions (created by 0001).
drop function if exists public.is_admin()        cascade;
drop function if exists public.touch_updated_at() cascade;

-- ---------------------------------------------------------------------------
-- 4. OPTIONAL — also delete every auth user (all test accounts, incl. admin).
--    Uncomment the next line for a TRUE from-zero reset. Cascades to profiles.
-- ---------------------------------------------------------------------------
delete from auth.users;

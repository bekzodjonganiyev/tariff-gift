-- ===========================================================================
-- 0003_admin_bootstrap.sql
--
-- Admin bootstrap + frictionless e-mail sign-up.
--
--   * The first THREE email/password sign-ups automatically become admins;
--     every later e-mail user — and ALL Google / OAuth users — stays a regular
--     'user'. The role is written straight into `raw_app_meta_data`, so it is
--     present in the JWT (`app_metadata.role`) on the user's very first access
--     token. No manual SQL grant, no sign-out/in dance.
--
--   * Email/password sign-ups are auto-confirmed (email_confirmed_at set), so
--     there is no e-mail-verification step. Pair this with the dashboard
--     setting: Authentication → Providers → Email → **turn "Confirm email"
--     OFF** so GoTrue stops sending confirmation mail and returns a session
--     immediately on sign-up.
--
-- Idempotent: safe to re-run.
-- ===========================================================================

create or replace function public.bootstrap_admin_on_signup()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  admin_count integer;
begin
  -- Only email/password sign-ups are eligible. Google (and any other OAuth)
  -- provider is never granted admin and is never auto-touched here.
  if coalesce(new.raw_app_meta_data ->> 'provider', '') = 'email' then
    -- No e-mail confirmation step: mark the address confirmed at creation.
    if new.email_confirmed_at is null then
      new.email_confirmed_at = now();
    end if;

    -- Grant admin to the first three e-mail sign-ups only.
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

-- BEFORE INSERT so the role is in place before `on_auth_user_created` (0001)
-- copies it into public.profiles, and before GoTrue mints the first JWT.
drop trigger if exists on_auth_user_bootstrap_admin on auth.users;
create trigger on_auth_user_bootstrap_admin
  before insert on auth.users
  for each row execute function public.bootstrap_admin_on_signup();

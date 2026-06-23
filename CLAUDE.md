# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # start dev server on localhost:3000
npm run build    # production build
npm run lint     # run ESLint
```

No test suite is configured.

## Environment

Two env vars are required in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

`lib/utils.ts` exports `hasEnvVars` (checks both are set) — this flag gates auth UI and proxy session refresh throughout the app. Remove it once the project is configured.

## Architecture

**Next.js App Router** with Supabase Auth via cookie-based sessions (`@supabase/ssr`).

### Supabase client factories

Three separate clients — never mix them up:

| File | Use when |
|------|----------|
| `lib/supabase/client.ts` | Client Components (`createBrowserClient`) |
| `lib/supabase/server.ts` | Server Components, Route Handlers, Server Actions (`createServerClient` + `cookies()`) |
| `lib/supabase/proxy.ts` | Proxy/middleware only — calls `getClaims()` to refresh sessions |

**Critical:** Never put a server client in a global variable (Fluid compute). Always call `createClient()` inside the function that needs it.

### Session management & route protection

`proxy.ts` (root) acts as the Next.js proxy. It calls `updateSession()` from `lib/supabase/proxy.ts` on every matched request. The proxy:
- Calls `supabase.auth.getClaims()` to keep sessions alive
- **Default-deny:** redirects any unauthenticated request to `/auth/login` — only `/`, `/auth/*` (and `/login`) are public. So new routes like `/dashboard` and `/success` are login-gated automatically, with no per-page code.
- **`/admin` requires an `admin` role.** The role is read from the JWT's `app_metadata` (`user.app_metadata.role`). Non-admins (and anonymous users) are redirected to `/`.

**Rule:** Nothing should run between `createServerClient` and `supabase.auth.getClaims()` in the proxy — it causes random logouts. The route/role checks happen *after* `getClaims()`.

**Authorization rule:** Store roles/permissions in `app_metadata`, **never `user_metadata`** — `user_metadata` is user-editable, so anyone could grant themselves admin. Grant admin server-side only, e.g. via SQL:
```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
where email = 'someone@example.com';
```
The role lands in the JWT on the user's next token refresh (not instantly).

### Auth flow

All auth routes live under `app/auth/`:
- `/auth/login` — password login + "Continue with Google"
- `/auth/sign-up` — registration + "Continue with Google". Email confirmation is **off** (dashboard + `0003` auto-confirm), so email sign-up returns a live session and routes straight into the app (`/admin` for admins, else `/protected`); the `/auth/sign-up-success` "check your email" page is only a fallback if confirmation gets re-enabled. The **first three email/password sign-ups become admins** via the `bootstrap_admin_on_signup` trigger (migration `0003`) — role written to `app_metadata.role`. Google/OAuth users are always regular users.
- `/auth/forgot-password` — sends reset email
- `/auth/update-password` — handles password reset
- `/auth/confirm` — email OTP verification route handler (verifies token, redirects to `next` param or `/`)
- `/auth/callback` — **OAuth callback** route handler; calls `exchangeCodeForSession(code)` then redirects to `next` (default `/protected`). Honours `x-forwarded-host` for deployments behind a proxy/load balancer.
- `/auth/error` — catch-all for auth errors (reads `?error=` message)

**Google OAuth:** `app/auth/actions.ts` exports the `signInWithGoogle` Server Action — it calls `signInWithOAuth({ provider: 'google', redirectTo: '<origin>/auth/callback' })` server-side and `redirect()`s the browser to `data.url`. The `<GoogleSignInButton>` client component (`components/google-sign-in-button.tsx`) posts to it via a `<form action={...}>` and uses `useFormStatus` for the pending state. Requires the Google provider to be enabled in the Supabase dashboard and the project's callback URL registered in Google Cloud.

### Protected routes

`app/protected/` has its own layout with a nav + footer. The layout is a Server Component. The page calls `supabase.auth.getClaims()` directly and redirects to login if no session — double-protection on top of the proxy.

Use `getClaims()` (not `getUser()` or `getSession()`) for reading the current user in server contexts — it's faster (no network round trip) and is what the proxy already uses.

### UI

- **shadcn/ui** components in `components/ui/` — add new ones with `npx shadcn@latest add <component>`
- **Tailwind CSS** v3 with `tailwindcss-animate`
- `lib/utils.ts` exports `cn()` (clsx + tailwind-merge) for conditional class names
- `next-themes` powers the theme switcher (dark/light)
- `components/tutorial/` contains onboarding-only components — safe to delete once the project is beyond the starter phase

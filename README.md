# Tariff Gift Approval App

Next.js (App Router) + Supabase app where users sign in with Google, browse
tariff cards, mock-buy a tariff, and apply for a gift. An admin reviews
applications — from the **web admin panel** or via a **Telegram bot** with
Approve / Reject buttons. On approval the app generates a single-use activation
code and e-mails it (SMTP). The user activates the gift for the tariff's period
and reaches the gated success page.

## Test credentials (for review)

| Role | Method | Email | Password |
|------|--------|-------|----------|
| **Admin** | Email & password | `admin@gmail.com` | `Admin123!` |
| Regular user | Google OAuth | use any Google account | — |

> The admin role lives in the JWT's `app_metadata.role` (server-only writable),
> never in `user_metadata`. After changing the role you must sign out and back
> in so a fresh JWT carries it.

## Stack

- **Next.js** App Router, Server Actions, Route Handlers
- **Supabase** Auth (Google OAuth + email/password) + Postgres + RLS
- **Telegram Bot API** (via `grammy`) for approve/reject
- **nodemailer** + any free SMTP (Brevo, Gmail app password, Mailtrap…)
- **Tailwind CSS** + shadcn/ui

## Commands

```bash
npm run dev            # dev server on localhost:3000
npm run build          # production build
npm run lint           # ESLint
npm run webhook:set <https-url>   # register the Telegram webhook
npm run webhook:info              # inspect webhook status
npm run webhook:delete            # remove the webhook
```

## Setup against a fresh Supabase project

### 1. Environment

Copy your Supabase keys into `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...            # server-only, bypasses RLS

# Telegram
TELEGRAM_BOT_TOKEN=...                   # from @BotFather
NEXT_PUBLIC_TELEGRAM_BOT_USERNAME=...    # bot @username (no @)
TELEGRAM_WEBHOOK_SECRET=...              # openssl rand -hex 32

# SMTP (activation e-mails)
SMTP_HOST=smtp-relay.brevo.com
SMTP_PORT=587
SMTP_USER=...
SMTP_PASSWORD=...
SMTP_FROM=you@verified-sender.com        # MUST be a verified sender (see §4)
```

### 2. Database

Run **both** migration files in the Supabase Dashboard → SQL Editor (in order).
They are idempotent — safe to re-run:

1. `supabase/migrations/0001_tariff_gift_app.sql` — tables, RLS, triggers
2. `supabase/migrations/0002_telegram_candidates.sql` — Telegram approver
   selection + audit-log columns

### 3. Make an admin

After signing up the admin account with email + password:

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
where email = 'admin@gmail.com';
```

Sign out and back in, then open `/admin`.

### 4. SMTP / activation e-mails

`SMTP_FROM` **must be a sender verified in your SMTP provider.** Brevo (and most
providers) accept mail from an unverified sender over SMTP — returning
`250 queued` — and then silently drop it, so the activation e-mail never
arrives. In Brevo: **Senders, Domains & Dedicated IPs → Senders → add & verify**
the address you put in `SMTP_FROM`.

### 5. Telegram bot

1. Create a bot with [@BotFather](https://t.me/BotFather); put the token in
   `.env.local` (`TELEGRAM_BOT_TOKEN`) and in `/admin → Telegram bot`.
2. Register the webhook: `npm run webhook:set https://<public-url>`
   (use an ngrok URL in dev).
3. The approver opens the bot and sends `/start`. They appear under
   **Telegram bot → Approver** in `/admin`.
4. The admin clicks **Make approver** to choose exactly who can act on
   Approve / Reject. (No one is auto-bound — the admin is in control.)

## How it works

### Auth & route protection

`proxy.ts` runs `lib/supabase/proxy.ts:updateSession` on every request:
default-deny — only `/`, `/auth/*` and `/api/telegram/*` are public; everything
else needs a session; `/admin` additionally needs `app_metadata.role === 'admin'`.

### Business rules (enforced server-side)

- At most one **pending** application per user (app check + partial unique index).
- Rejected users can re-apply.
- Approval generates a **single-use** activation code, e-mailed to the user.
- A gift can be activated only once; activation sets `expires_at` from the
  tariff's `period_months`.
- The `/success` and `/protected` pages require an active session; success
  states are reached only after a purchase or activation.

### Telegram approval flow

User applies → admin approver gets a Telegram message (user + tariff + period)
with Approve / Reject buttons → **Approve** generates a code + e-mails it,
**Reject** lets the user apply again. The same actions are available in the web
admin panel. Every notification and button action is recorded in `telegram_logs`
(sent / failed / approved / rejected, with the actor) and shown under
**Notification history**.

### Security

- `SUPABASE_SERVICE_ROLE_KEY` and `TELEGRAM_BOT_TOKEN` are server-only — never
  shipped to the client.
- `telegram_config`, `telegram_candidates` and `telegram_logs` have RLS enabled
  with **no policies**, so only the service-role key can touch them.
- The webhook validates Telegram's secret-token header.
- Authorization always reads the verified JWT, never user-editable metadata.

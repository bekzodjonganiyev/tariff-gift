# Setup — Tariff Gift Approval App

## 1. Apply the database schema (required)

The app needs a `purchases` table, three extra `gift_applications` columns, RLS
policies and a profile-creation trigger. These are **not yet applied** to the
live database.

Open **Supabase Dashboard → SQL Editor → New query**.

**Fastest (recommended):** run the single consolidated file — it is the squashed
equivalent of all three migrations and builds the whole schema in one shot:

- [`supabase/setup.sql`](supabase/setup.sql)

**Or** run the individual migrations in order (each is idempotent — safe to
re-run). Useful if you only need to apply a *new* one on top of an existing DB:

1. [`supabase/migrations/0001_tariff_gift_app.sql`](supabase/migrations/0001_tariff_gift_app.sql)
2. [`supabase/migrations/0002_telegram_candidates.sql`](supabase/migrations/0002_telegram_candidates.sql)
3. [`supabase/migrations/0003_admin_bootstrap.sql`](supabase/migrations/0003_admin_bootstrap.sql)

> If you have the database password you can instead run:
> `supabase link --project-ref jnajubmuxnongsqhrygf && supabase db push`

## 2. Turn OFF e-mail confirmation (required)

In **Authentication → Providers → Email**, switch **"Confirm email" OFF**.
Email/password sign-up then sends no verification mail and logs the user in
immediately. (Migration `0003` also auto-confirms email users as a backstop.)

Google / OAuth sign-in is unaffected.

## 3. Admins are assigned automatically

Admin gating reads `app_metadata.role` from the JWT (never `user_metadata`).
Migration `0003` installs a trigger so the **first three email/password
sign-ups become admins** — the role is on their JWT from the very first login,
no manual grant or re-login needed. Everyone after that, and every Google user,
is a regular `user`.

> Need a specific account to be admin later? You can still grant it by hand:
> ```sql
> update auth.users
> set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
> where email = 'admin@example.com';
> ```
> (Manual grants require the user to sign out and back in to refresh the JWT.)

## 4. Configure the Telegram bot

1. Create a bot with [@BotFather](https://t.me/BotFather), copy the token.
2. In `/admin → Telegram bot`, paste the token (saved to `telegram_config`).
3. Put the **same token** in `.env.local` as `TELEGRAM_BOT_TOKEN`, and set
   `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` to the bot's @username.
4. Register the webhook so Telegram can deliver Approve/Reject taps:
   `npm run webhook:set https://<your-public-url>` (use the ngrok URL in dev).
5. The approver opens the bot and sends `/start`, then the admin clicks
   **Make approver** in `/admin → Telegram bot`. The admin chooses who can
   approve/reject — no one is auto-bound.

## 5. SMTP (activation e-mails)

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` in
`.env.local`. Any free SMTP works (e.g. a Gmail app password, Brevo, Mailtrap).

## Flow

Home `/` → buy a tariff (mock) → `/success`, **or** apply for a gift →
admin gets a Telegram message → Approve generates a code, e-mails it →
user enters it on `/protected` → gift activates for the tariff's period.

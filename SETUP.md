# Setup — Tariff Gift Approval App

## 1. Apply the database schema (required)

The app needs a `purchases` table, three extra `gift_applications` columns, RLS
policies and a profile-creation trigger. These are **not yet applied** to the
live database.

Open **Supabase Dashboard → SQL Editor → New query** and run **both** files in
order (each is idempotent — safe to re-run):

1. [`supabase/migrations/0001_tariff_gift_app.sql`](supabase/migrations/0001_tariff_gift_app.sql)
2. [`supabase/migrations/0002_telegram_candidates.sql`](supabase/migrations/0002_telegram_candidates.sql)

> If you have the database password you can instead run:
> `supabase link --project-ref jnajubmuxnongsqhrygf && supabase db push`

## 2. Make yourself an admin

Admin gating reads `app_metadata.role` from the JWT (never `user_metadata`).
After signing up the admin account with email + password, run in the SQL Editor:

```sql
update auth.users
set raw_app_meta_data = raw_app_meta_data || '{"role":"admin"}'
where email = 'admin@example.com';
```

Sign out and back in so the role lands in a fresh JWT, then open `/admin`.

## 3. Configure the Telegram bot

1. Create a bot with [@BotFather](https://t.me/BotFather), copy the token.
2. In `/admin → Telegram bot`, paste the token (saved to `telegram_config`).
3. Put the **same token** in `.env.local` as `TELEGRAM_BOT_TOKEN`, and set
   `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` to the bot's @username.
4. Register the webhook so Telegram can deliver Approve/Reject taps:
   `npm run webhook:set https://<your-public-url>` (use the ngrok URL in dev).
5. The approver opens the bot and sends `/start`, then the admin clicks
   **Make approver** in `/admin → Telegram bot`. The admin chooses who can
   approve/reject — no one is auto-bound.

## 4. SMTP (activation e-mails)

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM` in
`.env.local`. Any free SMTP works (e.g. a Gmail app password, Brevo, Mailtrap).

## Flow

Home `/` → buy a tariff (mock) → `/success`, **or** apply for a gift →
admin gets a Telegram message → Approve generates a code, e-mails it →
user enters it on `/protected` → gift activates for the tariff's period.

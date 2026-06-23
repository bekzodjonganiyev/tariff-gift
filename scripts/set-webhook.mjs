// npm run webhook:set              — ro'yxatdan o'tkazish
// npm run webhook:info             — holat tekshirish
// npm run webhook:delete           — o'chirish

import { readFileSync } from "fs";
import { resolve } from "path";

// .env.local dan o'qish
function loadEnv() {
  try {
    const env = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of env.split("\n")) {
      const [key, ...rest] = line.split("=");
      if (key && rest.length && !key.startsWith("#")) {
        process.env[key.trim()] ??= rest.join("=").trim();
      }
    }
  } catch {
    // .env.local yo'q — environment dan o'qiladi (production)
  }
}

loadEnv();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;
const APP_URL = process.env.NEXT_PUBLIC_APP_URL; // production URL
const WEBHOOK_PATH = "/api/telegram/webhook";

if (!TOKEN) {
  console.error("❌  TELEGRAM_BOT_TOKEN topilmadi");
  process.exit(1);
}

const api = (method) =>
  `https://api.telegram.org/bot${TOKEN}/${method}`;

const arg = process.argv[2];

// ── Info ──────────────────────────────────────────────────────────────────
if (arg === "--info") {
  const res = await fetch(api("getWebhookInfo"));
  const json = await res.json();
  console.log(JSON.stringify(json.result, null, 2));
  process.exit(0);
}

// ── Delete ────────────────────────────────────────────────────────────────
if (arg === "--delete") {
  const res = await fetch(api("deleteWebhook"), { method: "POST" });
  const json = await res.json();
  console.log(json.ok ? "✅  Webhook o'chirildi" : `❌  ${json.description}`);
  process.exit(0);
}

// ── Set ───────────────────────────────────────────────────────────────────
const url = arg || APP_URL;

if (!url) {
  console.error(
    "❌  URL ko'rsatilmadi.\n" +
    "   Ishlatish: npm run webhook:set https://yourdomain.com\n" +
    "   Yoki .env.local ga NEXT_PUBLIC_APP_URL=https://yourdomain.com qo'shing",
  );
  process.exit(1);
}

const webhookUrl = url.replace(/\/$/, "") + WEBHOOK_PATH;

const body = new URLSearchParams({ url: webhookUrl });
if (SECRET) body.set("secret_token", SECRET);

const res = await fetch(api("setWebhook"), {
  method: "POST",
  body,
});
const json = await res.json();

if (json.ok) {
  console.log(`✅  Webhook ro'yxatdan o'tdi:\n   ${webhookUrl}`);
} else {
  console.error(`❌  ${json.description}`);
  process.exit(1);
}

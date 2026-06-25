import { createClient } from "@supabase/supabase-js";
import { Bot, webhookCallback, type Context } from "grammy";
import { after } from "next/server";

import { approveApplication, rejectApplication } from "@/lib/gift-approval";

// ---------------------------------------------------------------------------
// Answering a callback query can fail if Telegram has already expired it
// ("query is too old / query ID is invalid"). That happens when an update was
// retried after a slow response: the action was already handled on an earlier
// delivery, so the stale answer is harmless. We must NOT let it throw — an
// unhandled throw makes the webhook return 500, which makes Telegram retry the
// same update again, producing an endless 500 loop.
// ---------------------------------------------------------------------------

async function safeAnswerCallbackQuery(
  ctx: Context,
  options?: Parameters<Context["answerCallbackQuery"]>[0],
) {
  try {
    await ctx.answerCallbackQuery(options);
  } catch (err) {
    console.warn("[telegram] answerCallbackQuery skipped (stale query):", err);
  }
}

// Editing the original message can fail ("message is not modified", message too
// old). Never let it throw — the decision is already persisted in the database.
async function safeEditMessageText(ctx: Context, text: string) {
  try {
    await ctx.editMessageText(text, { reply_markup: { inline_keyboard: [] } });
  } catch (err) {
    console.warn("[telegram] editMessageText skipped:", err);
  }
}

// ---------------------------------------------------------------------------
// Fire-and-forget. grammy's webhookCallback does NOT return HTTP 200 to
// Telegram until the handler resolves — so awaiting the e-mail send (up to
// ~20s on a firewalled SMTP host) holds the webhook response open. Telegram
// then treats the delivery as failed and RETRIES the same update, so the
// backlog (pending_update_count) grows and the button appears to "freeze".
//
// This server runs as a single long-lived PM2 process (`next start`), so work
// detached from the request keeps running after we answer the webhook. We move
// the slow approve/reject work here and return 200 immediately.
// ---------------------------------------------------------------------------

function runDetached(label: string, work: () => Promise<void>): void {
  after(() => {
    return work().catch((err) => {
      console.error(`[telegram] detached task "${label}" failed:`, err);
    });
  });
}

// ---------------------------------------------------------------------------
// Supabase — created per request, never at module scope (Fluid compute risk).
// ---------------------------------------------------------------------------

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

// ---------------------------------------------------------------------------
// Bot — in webhook mode it opens no long-lived TCP connection, so a single
// module-scoped instance is safe and avoids re-parsing the token per request.
// ---------------------------------------------------------------------------

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

// ---------------------------------------------------------------------------
// /start — record the sender as a *candidate* approver. The admin then promotes
// one candidate to approver from the admin panel (telegram_config.admin_telegram_id).
// We no longer auto-bind the first sender, so the admin controls who can approve.
// ---------------------------------------------------------------------------

bot.command("start", async (ctx) => {
  const supabase = createServiceClient();
  const from = ctx.from!;
  const fromId = String(from.id);

  // Upsert the candidate so the admin can pick them from a list.
  await supabase.from("telegram_candidates").upsert(
    {
      telegram_id: fromId,
      first_name: from.first_name ?? null,
      last_name: from.last_name ?? null,
      username: from.username ?? null,
      last_seen: new Date().toISOString(),
    },
    { onConflict: "telegram_id" },
  );

  // Is an approver already chosen?
  const { data: config } = await supabase
    .from("telegram_config")
    .select("admin_telegram_id")
    .eq("id", 1)
    .maybeSingle();

  if (config?.admin_telegram_id === fromId) {
    await ctx.reply(
      "You are the approving admin for this bot. ✅\n" +
        "You'll receive gift applications here with Approve / Reject buttons.",
    );
    return;
  }

  await ctx.reply(
    "Thanks — your Telegram account has been registered.\n" +
      "Ask the site admin to mark you as the approver in the admin panel, " +
      "then you'll start receiving gift applications here.",
  );
});

// ---------------------------------------------------------------------------
// Admin check — only the chosen approver may act on buttons.
// ---------------------------------------------------------------------------

async function verifyApprover(telegramUserId: number): Promise<boolean> {
  const supabase = createServiceClient();
  const { data: config } = await supabase
    .from("telegram_config")
    .select("admin_telegram_id")
    .eq("id", 1)
    .maybeSingle();
  return (
    !!config?.admin_telegram_id &&
    config.admin_telegram_id === String(telegramUserId)
  );
}

// ---------------------------------------------------------------------------
// Approve — callback_data: "approve_<uuid>"
// ---------------------------------------------------------------------------

bot.callbackQuery(/^approve_(.+)$/, async (ctx) => {
  const appId = ctx.match[1];

  if (!(await verifyApprover(ctx.from.id))) {
    await safeAnswerCallbackQuery(ctx, {
      text: "Not authorized — only the approver chosen by the admin can act.",
      show_alert: true,
    });
    return;
  }

  // Stop the button's loading spinner IMMEDIATELY. The approval below sends an
  // e-mail, which can take seconds — or time out on hosts that firewall SMTP.
  // We must never keep Telegram (and the button) waiting on that.
  await safeAnswerCallbackQuery(ctx);

  const fromId = String(ctx.from.id);
  const originalText = ctx.callbackQuery.message?.text ?? "Application";

  // Detach the DB update + e-mail send so the webhook returns 200 right away.
  // Otherwise Telegram waits for SMTP and retries the update on timeout.
  runDetached(`approve_${appId}`, async () => {
    const result = await approveApplication(appId, {
      telegramId: fromId,
      label: `Telegram @${ctx.from.username ?? fromId}`,
    });

    const note = !result.ok
      ? `ℹ️ ${result.reason}`
      : `✅ Approved${result.emailSent ? " — activation code e-mailed" : " (e-mail failed — code not sent)"}`;

    await safeEditMessageText(ctx, `${originalText}\n\n${note}`);
  });
});

// ---------------------------------------------------------------------------
// Reject — callback_data: "reject_<uuid>"
// ---------------------------------------------------------------------------

bot.callbackQuery(/^reject_(.+)$/, async (ctx) => {
  const appId = ctx.match[1];

  if (!(await verifyApprover(ctx.from.id))) {
    await safeAnswerCallbackQuery(ctx, {
      text: "Not authorized — only the approver chosen by the admin can act.",
      show_alert: true,
    });
    return;
  }

  await safeAnswerCallbackQuery(ctx);

  const fromId = String(ctx.from.id);
  const originalText = ctx.callbackQuery.message?.text ?? "Application";

  runDetached(`reject_${appId}`, async () => {
    const result = await rejectApplication(appId, {
      telegramId: fromId,
      label: `Telegram @${ctx.from.username ?? fromId}`,
    });

    const note = !result.ok ? `ℹ️ ${result.reason}` : "❌ Rejected";

    await safeEditMessageText(ctx, `${originalText}\n\n${note}`);
  });
});

// ---------------------------------------------------------------------------
// Last-resort error boundary. Without a bot.catch handler, any throw inside a
// handler propagates out of webhookCallback as an HTTP 500, and Telegram retries
// the same update — which can snowball into a retry loop. Swallowing here means
// the webhook always answers 200 and Telegram stops retrying.
// ---------------------------------------------------------------------------

bot.catch((err) => {
  console.error("[telegram] unhandled handler error:", err.error);
});

// ---------------------------------------------------------------------------
// Route Handler — grammy's webhookCallback adapted to the Next.js App Router.
// secretToken validates Telegram's X-Telegram-Bot-Api-Secret-Token header.
// ---------------------------------------------------------------------------

export const POST = webhookCallback(bot, "std/http", {
  secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
});

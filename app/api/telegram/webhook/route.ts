import { createClient } from "@supabase/supabase-js";
import { Bot, webhookCallback, type Context } from "grammy";

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

  const fromId = String(ctx.from.id);
  const result = await approveApplication(appId, {
    telegramId: fromId,
    label: `Telegram @${ctx.from.username ?? fromId}`,
  });

  if (!result.ok) {
    await safeAnswerCallbackQuery(ctx, { text: result.reason, show_alert: true });
    return;
  }

  const originalText = ctx.callbackQuery.message?.text ?? "Application";
  await Promise.all([
    safeAnswerCallbackQuery(ctx, {
      text: result.emailSent ? "Approved ✅" : "Approved, but e-mail failed.",
    }),
    ctx.editMessageText(
      `${originalText}\n\n✅ Approved${result.emailSent ? " — activation code e-mailed" : " (e-mail failed — code not sent)"}`,
      { reply_markup: { inline_keyboard: [] } },
    ),
  ]);
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

  const fromId = String(ctx.from.id);
  const result = await rejectApplication(appId, {
    telegramId: fromId,
    label: `Telegram @${ctx.from.username ?? fromId}`,
  });

  if (!result.ok) {
    await safeAnswerCallbackQuery(ctx, { text: result.reason, show_alert: true });
    return;
  }

  const originalText = ctx.callbackQuery.message?.text ?? "Application";
  await Promise.all([
    safeAnswerCallbackQuery(ctx, { text: "Rejected ❌" }),
    ctx.editMessageText(`${originalText}\n\n❌ Rejected`, {
      reply_markup: { inline_keyboard: [] },
    }),
  ]);
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

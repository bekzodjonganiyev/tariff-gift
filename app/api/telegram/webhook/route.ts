import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { Bot, webhookCallback } from "grammy";

import { sendActivationCodeEmail } from "@/utils/email";

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

function periodLabel(months: number): string {
  return `${months} ${months === 1 ? "month" : "months"}`;
}

// ---------------------------------------------------------------------------
// Bot — in webhook mode it opens no long-lived TCP connection, so a single
// module-scoped instance is safe and avoids re-parsing the token per request.
// ---------------------------------------------------------------------------

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN!);

// ---------------------------------------------------------------------------
// /start — register the first user who messages the bot as THE admin approver.
// admin_telegram_id is stored as text, so compare/store as strings throughout.
// ---------------------------------------------------------------------------

bot.command("start", async (ctx) => {
  const supabase = createServiceClient();
  const fromId = String(ctx.from!.id);

  const { data: config, error } = await supabase
    .from("telegram_config")
    .select("id, admin_telegram_id")
    .eq("id", 1)
    .maybeSingle();

  if (error || !config) {
    await ctx.reply("Bot is not configured yet. Contact the site owner.");
    return;
  }

  if (config.admin_telegram_id) {
    await ctx.reply(
      config.admin_telegram_id === fromId
        ? "You are already registered as the approving admin. ✅"
        : "An admin is already registered for this bot.",
    );
    return;
  }

  const { error: updateError } = await supabase
    .from("telegram_config")
    .update({ admin_telegram_id: fromId, updated_at: new Date().toISOString() })
    .eq("id", config.id);

  if (updateError) {
    console.error("[start] failed to register admin:", updateError);
    await ctx.reply("Something went wrong. Please try again.");
    return;
  }

  await ctx.reply(
    "You are now registered as the approving admin. ✅\n" +
      "You'll receive gift applications here with Approve / Reject buttons.",
  );
});

// ---------------------------------------------------------------------------
// Admin check — run before handling any approve/reject callback.
// ---------------------------------------------------------------------------

async function verifyAdmin(telegramUserId: number): Promise<boolean> {
  const supabase = createServiceClient();
  const { data: config } = await supabase
    .from("telegram_config")
    .select("admin_telegram_id")
    .eq("id", 1)
    .maybeSingle();
  return config?.admin_telegram_id === String(telegramUserId);
}

// ---------------------------------------------------------------------------
// Approve — callback_data: "approve_<uuid>"
// ---------------------------------------------------------------------------

bot.callbackQuery(/^approve_(.+)$/, async (ctx) => {
  const appId = ctx.match[1];

  if (!(await verifyAdmin(ctx.from.id))) {
    await ctx.answerCallbackQuery({ text: "Not authorized.", show_alert: true });
    return;
  }

  const supabase = createServiceClient();

  const { data: app, error: fetchError } = await supabase
    .from("gift_applications")
    .select("id, applicant_email, status, tariffs ( name, period_months )")
    .eq("id", appId)
    .maybeSingle();

  if (fetchError || !app) {
    await ctx.answerCallbackQuery({ text: "Application not found.", show_alert: true });
    return;
  }

  if (app.status !== "pending") {
    await ctx.answerCallbackQuery({
      text: `Application is already ${app.status}.`,
      show_alert: true,
    });
    return;
  }

  const activationCode = randomBytes(16).toString("hex");

  const { error: updateError } = await supabase
    .from("gift_applications")
    .update({ status: "approved", activation_code: activationCode })
    .eq("id", appId);

  if (updateError) {
    console.error("[approve] update failed:", updateError);
    await ctx.answerCallbackQuery({ text: "Database error.", show_alert: true });
    return;
  }

  const tariff = app.tariffs as unknown as {
    name: string;
    period_months: number;
  } | null;
  const period = periodLabel(tariff?.period_months ?? 1);

  // Deliver the activation code by e-mail. If SMTP fails the application stays
  // approved (the admin can re-send) — we just record the failure.
  let emailError: string | null = null;
  try {
    await sendActivationCodeEmail(app.applicant_email, activationCode, period);
  } catch (err) {
    emailError = err instanceof Error ? err.message : "Failed to send e-mail.";
    console.error("[approve] e-mail failed:", emailError);
  }

  const originalText = ctx.callbackQuery.message?.text ?? "Application";

  await Promise.all([
    supabase.from("telegram_logs").insert({
      application_id: appId,
      status: emailError ? "approved_email_failed" : "approved",
      error_message: emailError,
    }),

    ctx.answerCallbackQuery({
      text: emailError ? "Approved, but e-mail failed." : "Approved ✅",
    }),

    ctx.editMessageText(
      `${originalText}\n\n✅ Approved${emailError ? " (e-mail failed — code not sent)" : " — activation code e-mailed"}`,
      { reply_markup: { inline_keyboard: [] } },
    ),
  ]);
});

// ---------------------------------------------------------------------------
// Reject — callback_data: "reject_<uuid>"
// ---------------------------------------------------------------------------

bot.callbackQuery(/^reject_(.+)$/, async (ctx) => {
  const appId = ctx.match[1];

  if (!(await verifyAdmin(ctx.from.id))) {
    await ctx.answerCallbackQuery({ text: "Not authorized.", show_alert: true });
    return;
  }

  const supabase = createServiceClient();

  const { data: app, error: fetchError } = await supabase
    .from("gift_applications")
    .select("id, status")
    .eq("id", appId)
    .maybeSingle();

  if (fetchError || !app) {
    await ctx.answerCallbackQuery({ text: "Application not found.", show_alert: true });
    return;
  }

  if (app.status !== "pending") {
    await ctx.answerCallbackQuery({
      text: `Application is already ${app.status}.`,
      show_alert: true,
    });
    return;
  }

  const { error: updateError } = await supabase
    .from("gift_applications")
    .update({ status: "rejected" })
    .eq("id", appId);

  if (updateError) {
    console.error("[reject] update failed:", updateError);
    await ctx.answerCallbackQuery({ text: "Database error.", show_alert: true });
    return;
  }

  const originalText = ctx.callbackQuery.message?.text ?? "Application";

  await Promise.all([
    supabase.from("telegram_logs").insert({
      application_id: appId,
      status: "rejected",
      error_message: null,
    }),

    ctx.answerCallbackQuery({ text: "Rejected ❌" }),

    ctx.editMessageText(`${originalText}\n\n❌ Rejected`, {
      reply_markup: { inline_keyboard: [] },
    }),
  ]);
});

// ---------------------------------------------------------------------------
// Route Handler — grammy's webhookCallback adapted to the Next.js App Router.
// secretToken validates Telegram's X-Telegram-Bot-Api-Secret-Token header.
// ---------------------------------------------------------------------------

export const POST = webhookCallback(bot, "std/http", {
  secretToken: process.env.TELEGRAM_WEBHOOK_SECRET,
});

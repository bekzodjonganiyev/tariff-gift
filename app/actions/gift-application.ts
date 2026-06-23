"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type SubmitGiftApplicationResult = {
  applicationId: string;
  /** Whether the admin Telegram notification was delivered. */
  notified: boolean;
};

/** Escape values interpolated into the Telegram HTML message. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function periodLabel(months: number): string {
  return `${months} ${months === 1 ? "month" : "months"}`;
}

/**
 * Submit a user's gift application for a given tariff.
 *
 * Flow:
 *  1. Require an authenticated user.
 *  2. Reject if the user already has a `pending` application.
 *  3. Insert a new `pending` application linked to `tariffId`.
 *  4. Read the admin's Telegram credentials from `telegram_config`.
 *  5. Notify the admin via the Telegram Bot API with Approve/Reject buttons.
 *  6. Record the notification attempt in `telegram_logs` (`sent` | `failed`).
 *
 * Throws on auth / validation / DB failures. A failed Telegram notification is
 * NOT fatal — the application already exists, so we log `failed` and return.
 */
export async function submitGiftApplication(
  tariffId: string,
): Promise<SubmitGiftApplicationResult> {
  if (!tariffId) {
    throw new Error("A tariff must be selected.");
  }

  // 1. Authentication — getClaims() reads the verified JWT, no network round-trip.
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const claims = claimsData?.claims;

  if (claimsError || !claims) {
    throw new Error("You must be signed in to apply.");
  }

  const userId = claims.sub as string;
  const userEmail = claims.email as string | undefined;

  if (!userEmail) {
    throw new Error("Your account has no e-mail address on file.");
  }

  // Resolve the tariff so we can show its name/period in the notification.
  const { data: tariff, error: tariffError } = await supabase
    .from("tariffs")
    .select("id, name, period_months")
    .eq("id", tariffId)
    .maybeSingle();

  if (tariffError) {
    throw new Error("Could not look up the selected tariff.");
  }
  if (!tariff) {
    throw new Error("The selected tariff does not exist.");
  }

  // 2. Business rule — at most one pending application per user. The partial
  //    unique index `gift_applications_one_pending_per_user` is the real guard;
  //    this is just a friendlier early error.
  const { data: existing, error: existingError } = await supabase
    .from("gift_applications")
    .select("id")
    .eq("user_id", userId)
    .eq("status", "pending")
    .maybeSingle();

  if (existingError) {
    throw new Error("Could not verify your existing applications.");
  }
  if (existing) {
    throw new Error("You already have a pending application.");
  }

  // 3. Insert the new application (RLS: user can only insert their own row).
  const { data: application, error: insertError } = await supabase
    .from("gift_applications")
    .insert({
      user_id: userId,
      applicant_email: userEmail,
      tariff_id: tariffId,
      status: "pending",
    })
    .select("id")
    .single();

  if (insertError || !application) {
    throw new Error("Could not submit your application. Please try again.");
  }

  const applicationId = application.id as string;

  // 4. Read admin Telegram credentials with the service-role client — these are
  //    secrets and must never be reachable through RLS by end users.
  const admin = createAdminClient();
  const { data: config } = await admin
    .from("telegram_config")
    .select("bot_token, admin_telegram_id")
    .eq("id", 1)
    .maybeSingle();

  // 5. + 6. Notify the admin and log the attempt.
  const notified = await notifyAdmin({
    admin,
    // Prefer the token saved in the admin panel, fall back to the env var the
    // webhook already uses — so notifications work as long as either is set.
    botToken: config?.bot_token ?? process.env.TELEGRAM_BOT_TOKEN ?? null,
    adminTelegramId: config?.admin_telegram_id ?? null,
    applicationId,
    userEmail,
    tariffName: tariff.name as string,
    tariffPeriod: periodLabel(tariff.period_months as number),
  });

  revalidatePath("/");
  revalidatePath("/protected");

  return { applicationId, notified };
}

async function notifyAdmin(params: {
  admin: ReturnType<typeof createAdminClient>;
  botToken: string | null;
  adminTelegramId: string | null;
  applicationId: string;
  userEmail: string;
  tariffName: string;
  tariffPeriod: string;
}): Promise<boolean> {
  const {
    admin,
    botToken,
    adminTelegramId,
    applicationId,
    userEmail,
    tariffName,
    tariffPeriod,
  } = params;

  let sent = false;
  let detail = "";

  if (!botToken || !adminTelegramId) {
    detail =
      "Telegram is not configured (missing bot_token or admin_telegram_id).";
  } else {
    const text =
      `🎁 <b>New gift application</b>\n\n` +
      `👤 <b>User:</b> ${escapeHtml(userEmail)}\n` +
      `📦 <b>Tariff:</b> ${escapeHtml(tariffName)}\n` +
      `🗓 <b>Period:</b> ${escapeHtml(tariffPeriod)}`;

    try {
      const res = await fetch(
        `https://api.telegram.org/bot${botToken}/sendMessage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: adminTelegramId,
            text,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: "✅ Approve",
                    callback_data: `approve_${applicationId}`,
                  },
                  {
                    text: "❌ Reject",
                    callback_data: `reject_${applicationId}`,
                  },
                ],
              ],
            },
          }),
        },
      );

      const body = (await res.json().catch(() => null)) as {
        ok?: boolean;
        description?: string;
      } | null;
      sent = res.ok && body?.ok === true;
      if (!sent) {
        detail = body?.description ?? `Telegram API returned HTTP ${res.status}`;
      }
    } catch (err) {
      detail =
        err instanceof Error
          ? err.message
          : "Network error contacting Telegram.";
    }
  }

  // Audit the attempt. Best-effort: a logging failure must not break the flow.
  const { error: logError } = await admin.from("telegram_logs").insert({
    application_id: applicationId,
    status: sent ? "sent" : "failed",
    error_message: detail || null,
  });

  if (logError) {
    console.error("[gift-application] failed to write telegram_logs:", logError);
  }

  return sent;
}

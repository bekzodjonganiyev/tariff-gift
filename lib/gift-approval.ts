import "server-only";

import { randomBytes } from "crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { sendActivationCodeEmail } from "@/utils/email";

/**
 * Shared gift approve / reject logic.
 *
 * Both the Telegram webhook (button taps) and the web admin panel call into
 * here so the two entry points behave identically:
 *   - approve: generate a single-use activation code, e-mail it, audit the attempt
 *   - reject : flip the status so the user can apply again, audit the action
 *
 * All writes use the service-role key (RLS is intentionally closed on
 * gift_applications updates). Every call is recorded in `telegram_logs` with the
 * action and the actor, so the admin's audit history shows who did what.
 */

function periodLabel(months: number): string {
  return `${months} ${months === 1 ? "month" : "months"}`;
}

function serviceClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}

export type ApprovalOutcome =
  | { ok: true; emailSent: boolean; emailError: string | null }
  | { ok: false; reason: string };

type Actor = {
  /** 'web' for the admin panel, the Telegram user id for a button tap. */
  telegramId: string | null;
  label: string;
};

/**
 * Approve a pending application: generate + e-mail an activation code.
 * Returns `ok: false` with a human reason when the application can't be approved
 * (not found / already decided), so callers can surface the right message.
 */
export async function approveApplication(
  appId: string,
  actor: Actor,
  client?: SupabaseClient,
): Promise<ApprovalOutcome> {
  const supabase = client ?? serviceClient();

  const { data: app, error: fetchError } = await supabase
    .from("gift_applications")
    .select("id, applicant_email, status, tariffs ( name, period_months )")
    .eq("id", appId)
    .maybeSingle();

  if (fetchError) return { ok: false, reason: "Database error." };
  if (!app) return { ok: false, reason: "Application not found." };
  if (app.status !== "pending") {
    return { ok: false, reason: `Application is already ${app.status}.` };
  }

  const activationCode = randomBytes(16).toString("hex");

  const { error: updateError } = await supabase
    .from("gift_applications")
    .update({ status: "approved", activation_code: activationCode })
    .eq("id", appId)
    .eq("status", "pending"); // guard against a concurrent decision

  if (updateError) return { ok: false, reason: "Could not update the application." };

  const tariff = app.tariffs as unknown as {
    name: string;
    period_months: number;
  } | null;
  const period = periodLabel(tariff?.period_months ?? 1);

  let emailError: string | null = null;
  try {
    await sendActivationCodeEmail(
      app.applicant_email as string,
      activationCode,
      period,
    );
  } catch (err) {
    emailError = err instanceof Error ? err.message : "Failed to send e-mail.";
    console.error("[approveApplication] e-mail failed:", emailError);
  }

  await supabase.from("telegram_logs").insert({
    application_id: appId,
    action: "approve",
    actor_telegram_id: actor.telegramId,
    status: emailError ? "approved_email_failed" : "approved",
    error_message: emailError
      ? `${actor.label}: ${emailError}`
      : `Approved by ${actor.label}`,
  });

  return { ok: true, emailSent: !emailError, emailError };
}

/** Reject a pending application so the user can apply again. */
export async function rejectApplication(
  appId: string,
  actor: Actor,
  client?: SupabaseClient,
): Promise<ApprovalOutcome> {
  const supabase = client ?? serviceClient();

  const { data: app, error: fetchError } = await supabase
    .from("gift_applications")
    .select("id, status")
    .eq("id", appId)
    .maybeSingle();

  if (fetchError) return { ok: false, reason: "Database error." };
  if (!app) return { ok: false, reason: "Application not found." };
  if (app.status !== "pending") {
    return { ok: false, reason: `Application is already ${app.status}.` };
  }

  const { error: updateError } = await supabase
    .from("gift_applications")
    .update({ status: "rejected" })
    .eq("id", appId)
    .eq("status", "pending");

  if (updateError) return { ok: false, reason: "Could not update the application." };

  await supabase.from("telegram_logs").insert({
    application_id: appId,
    action: "reject",
    actor_telegram_id: actor.telegramId,
    status: "rejected",
    error_message: `Rejected by ${actor.label}`,
  });

  return { ok: true, emailSent: false, emailError: null };
}

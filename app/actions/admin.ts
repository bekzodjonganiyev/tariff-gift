"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  approveApplication,
  rejectApplication,
} from "@/lib/gift-approval";

/**
 * Ensure the caller is an admin (JWT `app_metadata.role === 'admin'`) and
 * return the service-role client for the privileged write. Authorization is
 * read from the verified JWT — never from a user-editable source.
 */
async function requireAdmin() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;

  const role = (claims?.app_metadata as { role?: string } | undefined)?.role;
  if (error || !claims || role !== "admin") {
    throw new Error("Admins only.");
  }

  return createAdminClient();
}

export type CreateTariffInput = {
  name: string;
  price: number;
  periodMonths: number;
};

export async function createTariff(input: CreateTariffInput): Promise<void> {
  const admin = await requireAdmin();

  const name = input.name?.trim();
  const price = Number(input.price);
  const periodMonths = Number(input.periodMonths);

  if (!name) throw new Error("Tariff name is required.");
  if (!Number.isFinite(price) || price < 0) {
    throw new Error("Price must be a non-negative number.");
  }
  if (
    !Number.isInteger(periodMonths) ||
    periodMonths < 1 ||
    periodMonths > 12
  ) {
    throw new Error("Period must be a whole number of months between 1 and 12.");
  }

  const { error } = await admin.from("tariffs").insert({
    name,
    price,
    period_months: periodMonths,
    is_active: true,
  });

  if (error) throw new Error("Could not create the tariff.");

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function setTariffActive(
  tariffId: string,
  isActive: boolean,
): Promise<void> {
  const admin = await requireAdmin();

  const { error } = await admin
    .from("tariffs")
    .update({ is_active: isActive })
    .eq("id", tariffId);

  if (error) throw new Error("Could not update the tariff.");

  revalidatePath("/admin");
  revalidatePath("/");
}

export async function deleteTariff(tariffId: string): Promise<void> {
  const admin = await requireAdmin();

  const { error } = await admin.from("tariffs").delete().eq("id", tariffId);

  if (error) {
    throw new Error(
      "Could not delete the tariff (it may have purchases or applications attached).",
    );
  }

  revalidatePath("/admin");
  revalidatePath("/");
}

/**
 * Save the Telegram bot token. The admin chat id is filled in separately when
 * the admin opens the bot and sends /start (handled by the webhook).
 */
export async function saveTelegramConfig(botToken: string): Promise<void> {
  const admin = await requireAdmin();

  const token = botToken?.trim();
  if (!token) throw new Error("Bot token is required.");

  const { error } = await admin
    .from("telegram_config")
    .update({ bot_token: token, updated_at: new Date().toISOString() })
    .eq("id", 1);

  if (error) throw new Error("Could not save the Telegram configuration.");

  revalidatePath("/admin");
}

/**
 * Promote a Telegram candidate (someone who pressed /start) to THE approver.
 * This is the admin-controlled binding the task requires — the admin chooses
 * who can approve/reject, instead of the bot auto-binding the first sender.
 */
export async function setTelegramApprover(telegramId: string): Promise<void> {
  const admin = await requireAdmin();

  const id = telegramId?.trim();
  if (!id) throw new Error("A Telegram candidate must be selected.");

  // Must be a known candidate so we never bind an arbitrary id by mistake.
  const { data: candidate } = await admin
    .from("telegram_candidates")
    .select("telegram_id")
    .eq("telegram_id", id)
    .maybeSingle();

  if (!candidate) {
    throw new Error("That Telegram user hasn't pressed Start on the bot yet.");
  }

  const { error } = await admin
    .from("telegram_config")
    .update({ admin_telegram_id: id, updated_at: new Date().toISOString() })
    .eq("id", 1);

  if (error) throw new Error("Could not set the Telegram approver.");

  revalidatePath("/admin");
}

/** Forget the registered approver so a different candidate can be chosen. */
export async function resetTelegramAdmin(): Promise<void> {
  const admin = await requireAdmin();

  const { error } = await admin
    .from("telegram_config")
    .update({ admin_telegram_id: null, updated_at: new Date().toISOString() })
    .eq("id", 1);

  if (error) throw new Error("Could not reset the Telegram approver.");

  revalidatePath("/admin");
}

/**
 * Approve a gift application from the web admin panel (mirrors the Telegram
 * Approve button). Generates + e-mails the activation code via shared logic.
 */
export async function approveGiftApplication(appId: string): Promise<void> {
  await requireAdmin();

  const result = await approveApplication(appId, {
    telegramId: null,
    label: "web admin panel",
  });

  if (!result.ok) throw new Error(result.reason);
  if (!result.emailSent) {
    throw new Error(
      `Approved, but the activation e-mail failed: ${result.emailError ?? "unknown error"}`,
    );
  }

  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/protected");
}

/** Reject a gift application from the web admin panel. */
export async function rejectGiftApplication(appId: string): Promise<void> {
  await requireAdmin();

  const result = await rejectApplication(appId, {
    telegramId: null,
    label: "web admin panel",
  });

  if (!result.ok) throw new Error(result.reason);

  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/protected");
}

"use server";

import { revalidatePath } from "next/cache";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type PurchaseResult = {
  purchaseId: string;
  tariffName: string;
};

/**
 * Mock "buy a tariff" — payment is not real. Records a `purchases` row for the
 * authenticated user and returns enough to render the success page.
 */
export async function purchaseTariff(tariffId: string): Promise<PurchaseResult> {
  if (!tariffId) {
    throw new Error("A tariff must be selected.");
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;

  if (claimsError || !userId) {
    throw new Error("You must be signed in to buy a tariff.");
  }

  const { data: tariff, error: tariffError } = await supabase
    .from("tariffs")
    .select("id, name, price, is_active")
    .eq("id", tariffId)
    .maybeSingle();

  if (tariffError || !tariff || !tariff.is_active) {
    throw new Error("The selected tariff is not available.");
  }

  const { data: purchase, error: insertError } = await supabase
    .from("purchases")
    .insert({ user_id: userId, tariff_id: tariffId, amount: tariff.price })
    .select("id")
    .single();

  if (insertError || !purchase) {
    throw new Error("Could not complete the purchase. Please try again.");
  }

  revalidatePath("/protected");

  return { purchaseId: purchase.id as string, tariffName: tariff.name as string };
}

export type ActivateResult = {
  tariffName: string;
  /** ISO date the activated subscription runs until. */
  expiresAt: string;
};

/** Add `months` whole months to a Date, returning a new Date. */
function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

/**
 * Activate an approved gift with the activation code that was e-mailed to the
 * user. Verifies ownership + status with the user's session, then performs the
 * privileged status write with the service-role key (there is intentionally no
 * user-facing UPDATE policy on gift_applications).
 */
export async function activateGift(code: string): Promise<ActivateResult> {
  const activationCode = code.trim();
  if (!activationCode) {
    throw new Error("Enter your activation code.");
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;

  if (claimsError || !userId) {
    throw new Error("You must be signed in to activate a gift.");
  }

  // Read the application through the user's RLS scope — guarantees the code
  // belongs to *this* user before we touch it.
  const { data: application, error: appError } = await supabase
    .from("gift_applications")
    .select("id, status, is_activated, tariffs ( name, period_months )")
    .eq("user_id", userId)
    .eq("activation_code", activationCode)
    .maybeSingle();

  if (appError) {
    throw new Error("Could not verify your activation code.");
  }
  if (!application) {
    throw new Error("Invalid activation code.");
  }
  if (application.status !== "approved") {
    throw new Error("This application has not been approved.");
  }
  if (application.is_activated) {
    throw new Error("This gift has already been activated.");
  }

  const tariff = application.tariffs as unknown as {
    name: string;
    period_months: number;
  } | null;
  const periodMonths = tariff?.period_months ?? 1;
  const expiresAt = addMonths(new Date(), periodMonths);

  const admin = createAdminClient();
  const { error: updateError } = await admin
    .from("gift_applications")
    .update({
      is_activated: true,
      activated_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    })
    .eq("id", application.id)
    .eq("user_id", userId);

  if (updateError) {
    throw new Error("Could not activate your gift. Please try again.");
  }

  revalidatePath("/protected");

  return {
    tariffName: tariff?.name ?? "your gift",
    expiresAt: expiresAt.toISOString(),
  };
}

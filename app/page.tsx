import Link from "next/link";
import { Gift, Sparkles } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { hasEnvVars } from "@/lib/utils";
import { SiteHeader } from "@/components/site-header";
import { TariffCard, type UserApplicationState } from "@/components/tariff-card";
import { EnvVarWarning } from "@/components/env-var-warning";
import { ThemeSwitcher } from "@/components/theme-switcher";
import type { Tariff } from "@/lib/types";

export default async function Home() {
  if (!hasEnvVars) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <EnvVarWarning />
      </main>
    );
  }

  const supabase = await createClient();

  const [{ data: tariffs }, { data: claimsData }] = await Promise.all([
    supabase
      .from("tariffs")
      .select("id, name, price, period_months, is_active, created_at")
      .eq("is_active", true)
      .order("price", { ascending: true }),
    supabase.auth.getClaims(),
  ]);

  const userId = claimsData?.claims?.sub as string | undefined;
  const isAuthed = !!userId;

  // The user's current active application (one pending/approved at a time)
  // drives each card's Applied / Activate / Active state.
  let application: UserApplicationState = null;
  if (userId) {
    const { data } = await supabase
      .from("gift_applications")
      .select("tariff_id, status, is_activated")
      .eq("user_id", userId)
      .in("status", ["pending", "approved"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    application = (data as UserApplicationState) ?? null;
  }

  const list = (tariffs ?? []) as Tariff[];

  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader />

      <section className="mx-auto w-full max-w-6xl px-5 pb-12 pt-16 text-center">
        <div className="mx-auto mb-5 inline-flex items-center gap-2 rounded-full border bg-accent/50 px-4 py-1.5 text-sm text-muted-foreground">
          <Sparkles className="size-4 text-primary" />
          Buy a tariff, apply for a free gift
        </div>
        <h1 className="mx-auto max-w-2xl text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          Choose a tariff that fits you
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-balance text-muted-foreground">
          Pick a plan, buy it in a click, and apply for a gift for your chosen
          period. Once an admin approves, we e-mail your activation code.
        </p>
      </section>

      <section className="mx-auto w-full max-w-6xl flex-1 px-5 pb-24">
        {list.length === 0 ? (
          <div className="mx-auto grid max-w-md place-items-center gap-3 rounded-xl border border-dashed p-12 text-center">
            <Gift className="size-8 text-muted-foreground" />
            <p className="font-medium">No tariffs available yet</p>
            <p className="text-sm text-muted-foreground">
              An admin hasn&apos;t published any active tariffs. Check back soon.
            </p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((tariff) => (
              <TariffCard
                key={tariff.id}
                tariff={tariff}
                isAuthed={isAuthed}
                application={application}
              />
            ))}
          </div>
        )}
      </section>

      <footer className="border-t">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-8 text-xs text-muted-foreground">
          <p>
            Powered by{" "}
            <a
              href="https://supabase.com/"
              target="_blank"
              rel="noreferrer"
              className="font-semibold hover:underline"
            >
              Supabase
            </a>{" "}
            &{" "}
            <Link href="https://nextjs.org/" className="font-semibold hover:underline">
              Next.js
            </Link>
          </p>
          <ThemeSwitcher />
        </div>
      </footer>
    </main>
  );
}

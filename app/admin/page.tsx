import { redirect } from "next/navigation";
import { Send, Tag } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SiteHeader } from "@/components/site-header";
import { CreateTariffForm } from "@/components/admin/create-tariff-form";
import { TariffRow } from "@/components/admin/tariff-row";
import { TelegramConfigForm } from "@/components/admin/telegram-config-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tariff } from "@/lib/types";

export default async function AdminPage() {
  // Defense in depth on top of the proxy: re-check the admin role from the JWT.
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const role = (claimsData?.claims?.app_metadata as { role?: string } | undefined)
    ?.role;
  if (role !== "admin") redirect("/");

  // Read with the service-role client so we can list hidden tariffs and the
  // (RLS-protected) telegram_config secrets in one place.
  const admin = createAdminClient();
  const [{ data: tariffsData }, { data: config }] = await Promise.all([
    admin
      .from("tariffs")
      .select("id, name, price, period_months, is_active, created_at")
      .order("created_at", { ascending: false }),
    admin
      .from("telegram_config")
      .select("bot_token, admin_telegram_id")
      .eq("id", 1)
      .maybeSingle(),
  ]);

  const tariffs = (tariffsData ?? []) as Tariff[];
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || null;

  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-10 px-5 py-10">
        <header>
          <h1 className="text-3xl font-bold tracking-tight">Admin</h1>
          <p className="mt-1 text-muted-foreground">
            Manage tariffs and connect the Telegram approval bot.
          </p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="size-5 text-primary" /> Tariffs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <CreateTariffForm />
            <div className="divide-y rounded-xl border">
              {tariffs.length === 0 ? (
                <p className="p-6 text-center text-sm text-muted-foreground">
                  No tariffs yet — create your first one above.
                </p>
              ) : (
                tariffs.map((t) => <TariffRow key={t.id} tariff={t} />)
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="size-5 text-primary" /> Telegram bot
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TelegramConfigForm
              hasToken={!!config?.bot_token}
              adminConnected={!!config?.admin_telegram_id}
              botUsername={botUsername}
            />
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

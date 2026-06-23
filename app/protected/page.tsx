import { redirect } from "next/navigation";
import Link from "next/link";
import { Gift, Receipt } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { ActivateGiftForm } from "@/components/activate-gift-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPeriod, formatPrice, type GiftStatus } from "@/lib/types";

type TariffRef = { name: string; period_months: number; price: number } | null;

type ApplicationRow = {
  id: string;
  status: GiftStatus;
  is_activated: boolean;
  activation_code: string | null;
  expires_at: string | null;
  created_at: string;
  tariffs: TariffRef;
};

type PurchaseRow = {
  id: string;
  amount: number;
  created_at: string;
  tariffs: TariffRef;
};

function statusBadge(app: ApplicationRow) {
  if (app.is_activated) return <Badge>Active</Badge>;
  if (app.status === "approved")
    return <Badge variant="secondary">Approved</Badge>;
  if (app.status === "rejected")
    return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="outline">Pending review</Badge>;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function ProtectedPage() {
  const supabase = await createClient();
  const { data: claimsData, error } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;

  if (error || !userId) redirect("/auth/login");

  const [{ data: appsData }, { data: purchasesData }] = await Promise.all([
    supabase
      .from("gift_applications")
      .select(
        "id, status, is_activated, activation_code, expires_at, created_at, tariffs ( name, period_months, price )",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("purchases")
      .select("id, amount, created_at, tariffs ( name, period_months, price )")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
  ]);

  const applications = (appsData ?? []) as unknown as ApplicationRow[];
  const purchases = (purchasesData ?? []) as unknown as PurchaseRow[];
  const pendingActivation = applications.find(
    (a) => a.status === "approved" && !a.is_activated,
  );

  return (
    <div className="flex flex-col gap-10">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">My account</h1>
        <p className="mt-1 text-muted-foreground">
          Track your tariffs, gift applications and activations.
        </p>
      </header>

      {pendingActivation && (
        <Card className="border-primary/40 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Gift className="size-5 text-primary" /> Your gift is approved!
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              We e-mailed your activation code for{" "}
              <strong className="text-foreground">
                {pendingActivation.tariffs?.name}
              </strong>
              . Enter it below to activate your gift for{" "}
              {formatPeriod(pendingActivation.tariffs?.period_months ?? 1)}.
            </p>
            <ActivateGiftForm
              defaultCode={pendingActivation.activation_code ?? ""}
            />
          </CardContent>
        </Card>
      )}

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Gift applications</h2>
        {applications.length === 0 ? (
          <EmptyState
            icon={<Gift className="size-6 text-muted-foreground" />}
            title="No applications yet"
            body="Apply for a gift from any tariff on the home page."
          />
        ) : (
          <div className="divide-y rounded-xl border">
            {applications.map((app) => (
              <div
                key={app.id}
                className="flex flex-wrap items-center justify-between gap-3 p-4"
              >
                <div>
                  <p className="font-medium">
                    {app.tariffs?.name ?? "Tariff"}
                    <span className="ml-2 text-sm font-normal text-muted-foreground">
                      · {formatPeriod(app.tariffs?.period_months ?? 1)}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Applied {fmtDate(app.created_at)}
                    {app.is_activated && app.expires_at && (
                      <> · active until {fmtDate(app.expires_at)}</>
                    )}
                  </p>
                </div>
                {statusBadge(app)}
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="text-xl font-semibold">Purchases</h2>
        {purchases.length === 0 ? (
          <EmptyState
            icon={<Receipt className="size-6 text-muted-foreground" />}
            title="No purchases yet"
            body="Buy a tariff from the home page to get started."
          />
        ) : (
          <div className="divide-y rounded-xl border">
            {purchases.map((p) => (
              <div
                key={p.id}
                className="flex items-center justify-between gap-3 p-4"
              >
                <div>
                  <p className="font-medium">{p.tariffs?.name ?? "Tariff"}</p>
                  <p className="text-xs text-muted-foreground">
                    Bought {fmtDate(p.created_at)}
                  </p>
                </div>
                <span className="font-semibold">{formatPrice(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="grid place-items-center gap-2 rounded-xl border border-dashed p-10 text-center">
      {icon}
      <p className="font-medium">{title}</p>
      <p className="text-sm text-muted-foreground">{body}</p>
      <Button asChild variant="outline" size="sm" className="mt-2">
        <Link href="/">Browse tariffs</Link>
      </Button>
    </div>
  );
}

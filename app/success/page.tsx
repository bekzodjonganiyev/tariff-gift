import Link from "next/link";
import { CheckCircle2, Gift } from "lucide-react";

import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type SearchParams = {
  type?: string;
  tariff?: string;
  until?: string;
};

export default async function SuccessPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { type, tariff, until } = await searchParams;
  const isActivation = type === "activation";

  const title = isActivation ? "Gift activated 🎉" : "Purchase complete 🎉";
  const tariffName = tariff ? decodeURIComponent(tariff) : null;

  let untilLabel: string | null = null;
  if (isActivation && until) {
    const d = new Date(decodeURIComponent(until));
    if (!Number.isNaN(d.getTime())) {
      untilLabel = d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    }
  }

  return (
    <main className="flex min-h-screen flex-col">
      <SiteHeader />
      <div className="mx-auto grid w-full max-w-lg flex-1 place-items-center px-5 py-16">
        <Card className="w-full text-center">
          <CardHeader className="items-center gap-3">
            <span className="grid size-14 place-items-center rounded-full bg-primary/10">
              {isActivation ? (
                <Gift className="size-7 text-primary" />
              ) : (
                <CheckCircle2 className="size-7 text-primary" />
              )}
            </span>
            <CardTitle className="text-2xl">{title}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <p className="text-muted-foreground">
              {isActivation ? (
                <>
                  Your gift{tariffName ? <> for <strong className="text-foreground">{tariffName}</strong></> : null}{" "}
                  is now active
                  {untilLabel ? <> until <strong className="text-foreground">{untilLabel}</strong></> : null}.
                </>
              ) : (
                <>
                  You&apos;ve bought{" "}
                  {tariffName ? (
                    <strong className="text-foreground">{tariffName}</strong>
                  ) : (
                    "your tariff"
                  )}
                  . You can now apply for a gift for this period.
                </>
              )}
            </p>
            <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button asChild>
                <Link href="/protected">Go to my account</Link>
              </Button>
              <Button asChild variant="outline">
                <Link href="/">Back to tariffs</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}

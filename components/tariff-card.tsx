"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Clock, Gift, Loader2 } from "lucide-react";

import { submitGiftApplication } from "@/app/actions/gift-application";
import { purchaseTariff } from "@/app/actions/tariff";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { formatPeriod, formatPrice, type Tariff } from "@/lib/types";

export type UserApplicationState = {
  tariff_id: string;
  status: "pending" | "approved" | "rejected";
  is_activated: boolean;
} | null;

export function TariffCard({
  tariff,
  isAuthed,
  application,
}: {
  tariff: Tariff;
  isAuthed: boolean;
  application: UserApplicationState;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"buy" | "apply" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isThisTariff = application?.tariff_id === tariff.id;
  const appliedHere = isThisTariff && application?.status === "pending";
  const approvedHere =
    isThisTariff &&
    application?.status === "approved" &&
    !application.is_activated;
  const activeHere =
    isThisTariff && application?.status === "approved" && application.is_activated;
  const hasPendingElsewhere =
    !!application && application.status === "pending" && !isThisTariff;

  function handleBuy() {
    if (!isAuthed) return router.push("/auth/login");
    setError(null);
    setAction("buy");
    startTransition(async () => {
      try {
        const res = await purchaseTariff(tariff.id);
        router.push(
          `/success?type=purchase&tariff=${encodeURIComponent(res.tariffName)}`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setAction(null);
      }
    });
  }

  function handleApply() {
    if (!isAuthed) return router.push("/auth/login");
    setError(null);
    setAction("apply");
    startTransition(async () => {
      try {
        await submitGiftApplication(tariff.id);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setAction(null);
      }
    });
  }

  return (
    <Card className="flex flex-col overflow-hidden transition-shadow hover:shadow-md">
      <CardHeader className="gap-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{tariff.name}</CardTitle>
          <Badge variant="secondary">{formatPeriod(tariff.period_months)}</Badge>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-3xl font-bold tracking-tight">
            {formatPrice(tariff.price)}
          </span>
          <span className="text-sm text-muted-foreground">
            / {formatPeriod(tariff.period_months)}
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li className="flex items-center gap-2">
            <Check className="size-4 text-primary" />
            Full access for {formatPeriod(tariff.period_months)}
          </li>
          <li className="flex items-center gap-2">
            <Gift className="size-4 text-primary" />
            Eligible for a free gift
          </li>
        </ul>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      </CardContent>

      <CardFooter className="flex-col gap-2">
        <Button
          className="w-full"
          onClick={handleBuy}
          disabled={pending}
        >
          {pending && action === "buy" ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Processing…
            </>
          ) : (
            "Buy tariff"
          )}
        </Button>

        {activeHere ? (
          <Badge className="w-full justify-center py-1.5" variant="default">
            <Check className="mr-1 size-3.5" /> Gift active
          </Badge>
        ) : approvedHere ? (
          <Button
            className="w-full"
            variant="outline"
            onClick={() => router.push("/protected")}
          >
            <Gift className="size-4" /> Activate your gift
          </Button>
        ) : appliedHere ? (
          <Badge
            className="w-full justify-center py-1.5"
            variant="outline"
          >
            <Clock className="mr-1 size-3.5" /> Applied — pending review
          </Badge>
        ) : (
          <Button
            className="w-full"
            variant="outline"
            onClick={handleApply}
            disabled={pending || hasPendingElsewhere}
            title={
              hasPendingElsewhere
                ? "Finish your current pending application first"
                : undefined
            }
          >
            {pending && action === "apply" ? (
              <>
                <Loader2 className="size-4 animate-spin" /> Applying…
              </>
            ) : (
              <>
                <Gift className="size-4" /> Apply for gift
              </>
            )}
          </Button>
        )}
        {hasPendingElsewhere && (
          <p className="text-center text-xs text-muted-foreground">
            You already have a pending gift application.
          </p>
        )}
      </CardFooter>
    </Card>
  );
}

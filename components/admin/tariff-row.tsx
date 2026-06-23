"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Trash2 } from "lucide-react";

import { deleteTariff, setTariffActive } from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPeriod, formatPrice, type Tariff } from "@/lib/types";

export function TariffRow({ tariff }: { tariff: Tariff }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<void>) {
    setError(null);
    startTransition(async () => {
      try {
        await fn();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          {tariff.name}
          {tariff.is_active ? (
            <Badge variant="secondary">Active</Badge>
          ) : (
            <Badge variant="outline">Hidden</Badge>
          )}
        </p>
        <p className="text-xs text-muted-foreground">
          {formatPrice(tariff.price)} · {formatPeriod(tariff.period_months)}
        </p>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => run(() => setTariffActive(tariff.id, !tariff.is_active))}
        >
          {pending && <Loader2 className="size-3.5 animate-spin" />}
          {tariff.is_active ? "Hide" : "Publish"}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          disabled={pending}
          aria-label="Delete tariff"
          onClick={() => {
            if (confirm(`Delete "${tariff.name}"? This cannot be undone.`)) {
              run(() => deleteTariff(tariff.id));
            }
          }}
        >
          <Trash2 className="size-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}

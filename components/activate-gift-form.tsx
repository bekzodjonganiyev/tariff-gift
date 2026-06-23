"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";

import { activateGift } from "@/app/actions/tariff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Redeem an activation code that was e-mailed after a gift was approved.
 * `defaultCode` lets the dashboard pre-fill the code we already hold server-side.
 */
export function ActivateGiftForm({ defaultCode = "" }: { defaultCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(defaultCode);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        const res = await activateGift(code);
        router.push(
          `/success?type=activation&tariff=${encodeURIComponent(res.tariffName)}&until=${encodeURIComponent(res.expiresAt)}`,
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not activate.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
      <Input
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Paste your activation code"
        className="font-mono"
        required
      />
      <Button type="submit" disabled={pending} className="shrink-0">
        {pending ? (
          <>
            <Loader2 className="size-4 animate-spin" /> Activating…
          </>
        ) : (
          "Activate gift"
        )}
      </Button>
      {error && (
        <p className="text-sm text-destructive sm:order-last sm:w-full">
          {error}
        </p>
      )}
    </form>
  );
}

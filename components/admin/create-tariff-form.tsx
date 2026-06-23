"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Plus } from "lucide-react";

import { createTariff } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function CreateTariffForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [period, setPeriod] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      try {
        await createTariff({
          name,
          price: Number(price),
          periodMonths: Number(period),
        });
        setName("");
        setPrice("");
        setPeriod("1");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not create tariff.");
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4 sm:grid-cols-[1fr_140px_160px_auto] sm:items-end">
      <div className="grid gap-1.5">
        <Label htmlFor="t-name">Name</Label>
        <Input
          id="t-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Pro plan"
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="t-price">Price (USD)</Label>
        <Input
          id="t-price"
          type="number"
          min="0"
          step="0.01"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="49"
          required
        />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="t-period">Period (months)</Label>
        <select
          id="t-period"
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
            <option key={m} value={m}>
              {m} {m === 1 ? "month" : "months"}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" disabled={pending}>
        {pending ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Plus className="size-4" />
        )}
        Add tariff
      </Button>
      {error && (
        <p className="text-sm text-destructive sm:col-span-full">{error}</p>
      )}
    </form>
  );
}

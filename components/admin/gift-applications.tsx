"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, Loader2, X } from "lucide-react";

import {
  approveGiftApplication,
  rejectGiftApplication,
} from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatPeriod } from "@/lib/types";

export type AdminApplication = {
  id: string;
  status: "pending" | "approved" | "rejected";
  is_activated: boolean;
  applicant_email: string | null;
  created_at: string;
  tariffs: { name: string; period_months: number } | null;
};

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function StatusBadge({ app }: { app: AdminApplication }) {
  if (app.is_activated) return <Badge>Active</Badge>;
  if (app.status === "approved")
    return <Badge variant="secondary">Approved</Badge>;
  if (app.status === "rejected")
    return <Badge variant="destructive">Rejected</Badge>;
  return <Badge variant="outline">Pending</Badge>;
}

export function GiftApplications({ apps }: { apps: AdminApplication[] }) {
  if (apps.length === 0) {
    return (
      <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
        No gift applications yet.
      </p>
    );
  }

  return (
    <div className="divide-y rounded-xl border">
      {apps.map((app) => (
        <ApplicationRow key={app.id} app={app} />
      ))}
    </div>
  );
}

function ApplicationRow({ app }: { app: AdminApplication }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [action, setAction] = useState<"approve" | "reject" | null>(null);

  function run(kind: "approve" | "reject") {
    setError(null);
    setAction(kind);
    startTransition(async () => {
      try {
        if (kind === "approve") await approveGiftApplication(app.id);
        else await rejectGiftApplication(app.id);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      } finally {
        setAction(null);
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="font-medium">
          {app.applicant_email ?? "Unknown user"}
        </p>
        <p className="text-xs text-muted-foreground">
          {app.tariffs?.name ?? "Tariff"} ·{" "}
          {formatPeriod(app.tariffs?.period_months ?? 1)} · applied{" "}
          {fmtDate(app.created_at)}
        </p>
        {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge app={app} />
        {app.status === "pending" && (
          <>
            <Button
              size="sm"
              disabled={pending}
              onClick={() => run("approve")}
            >
              {pending && action === "approve" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Check className="size-3.5" />
              )}
              Approve
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => run("reject")}
            >
              {pending && action === "reject" ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <X className="size-3.5" />
              )}
              Reject
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

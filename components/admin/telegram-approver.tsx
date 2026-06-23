"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, UserCheck } from "lucide-react";

import {
  resetTelegramAdmin,
  setTelegramApprover,
} from "@/app/actions/admin";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type TelegramCandidate = {
  telegram_id: string;
  first_name: string | null;
  last_name: string | null;
  username: string | null;
  last_seen: string;
};

function label(c: TelegramCandidate) {
  const name = [c.first_name, c.last_name].filter(Boolean).join(" ");
  return name || (c.username ? `@${c.username}` : `ID ${c.telegram_id}`);
}

export function TelegramApprover({
  candidates,
  currentApproverId,
}: {
  candidates: TelegramCandidate[];
  currentApproverId: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  function choose(telegramId: string | null) {
    setError(null);
    setPendingId(telegramId ?? "__reset__");
    startTransition(async () => {
      try {
        if (telegramId) await setTelegramApprover(telegramId);
        else await resetTelegramAdmin();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Action failed.");
      } finally {
        setPendingId(null);
      }
    });
  }

  // Always show the current approver, even if they pressed /start before the
  // candidates table existed (so they have no candidate row yet).
  const rows: TelegramCandidate[] =
    currentApproverId &&
    !candidates.some((c) => c.telegram_id === currentApproverId)
      ? [
          {
            telegram_id: currentApproverId,
            first_name: null,
            last_name: null,
            username: null,
            last_seen: new Date().toISOString(),
          },
          ...candidates,
        ]
      : candidates;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Approver</p>
        <p className="text-xs text-muted-foreground">
          Whoever opens the bot and sends <code>/start</code> appears below.
          Choose exactly one to receive applications and act on the Approve /
          Reject buttons.
        </p>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
          No one has pressed <code>/start</code> yet. Open the bot, send{" "}
          <code>/start</code>, then refresh.
        </p>
      ) : (
        <div className="divide-y rounded-xl border">
          {rows.map((c) => {
            const isApprover = c.telegram_id === currentApproverId;
            return (
              <div
                key={c.telegram_id}
                className="flex flex-wrap items-center justify-between gap-3 p-3"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-medium">
                    {label(c)}
                    {isApprover && (
                      <Badge>
                        <UserCheck className="mr-1 size-3" /> Approver
                      </Badge>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {c.username ? `@${c.username} · ` : ""}ID {c.telegram_id}
                  </p>
                </div>
                {isApprover ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={pendingId !== null}
                    onClick={() => choose(null)}
                  >
                    {pendingId === "__reset__" && (
                      <Loader2 className="size-3.5 animate-spin" />
                    )}
                    Remove
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pendingId !== null}
                    onClick={() => choose(c.telegram_id)}
                  >
                    {pendingId === c.telegram_id && (
                      <Loader2 className="size-3.5 animate-spin" />
                    )}
                    Make approver
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

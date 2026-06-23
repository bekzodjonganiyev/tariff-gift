"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Check, ExternalLink, Loader2, X } from "lucide-react";

import { resetTelegramAdmin, saveTelegramConfig } from "@/app/actions/admin";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function TelegramConfigForm({
  hasToken,
  adminConnected,
  botUsername,
}: {
  hasToken: boolean;
  adminConnected: boolean;
  botUsername: string | null;
}) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, startSave] = useTransition();
  const [resetting, startReset] = useTransition();

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startSave(async () => {
      try {
        await saveTelegramConfig(token);
        setToken("");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save.");
      }
    });
  }

  function handleReset() {
    setError(null);
    startReset(async () => {
      try {
        await resetTelegramAdmin();
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not reset.");
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        <StatusPill ok={hasToken} label="Bot token" okText="Saved" badText="Missing" />
        <StatusPill
          ok={adminConnected}
          label="Admin chat"
          okText="Connected"
          badText="Not connected"
        />
      </div>

      <form onSubmit={handleSave} className="space-y-2">
        <Label htmlFor="bot-token">Bot token</Label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            id="bot-token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder={hasToken ? "•••••• (saved — paste to replace)" : "123456:ABC-DEF…"}
            className="font-mono"
            required
          />
          <Button type="submit" disabled={saving} className="shrink-0">
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Save token
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Get a token from{" "}
          <a
            href="https://t.me/BotFather"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            @BotFather
          </a>
          . Use the same token in your <code>TELEGRAM_BOT_TOKEN</code> env var so
          the webhook can receive approvals.
        </p>
      </form>

      <div className="rounded-lg border bg-muted/30 p-4 text-sm">
        <p className="font-medium">Connect the approving admin</p>
        <p className="mt-1 text-muted-foreground">
          Open the bot and send <code>/start</code>. The first person to do so
          becomes the approver and will receive applications with Approve /
          Reject buttons.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {botUsername && (
            <Button asChild variant="outline" size="sm">
              <a
                href={`https://t.me/${botUsername}`}
                target="_blank"
                rel="noreferrer"
              >
                Open bot <ExternalLink className="size-3.5" />
              </a>
            </Button>
          )}
          {adminConnected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              disabled={resetting}
            >
              {resetting ? <Loader2 className="size-3.5 animate-spin" /> : null}
              Reset admin
            </Button>
          )}
        </div>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

function StatusPill({
  ok,
  label,
  okText,
  badText,
}: {
  ok: boolean;
  label: string;
  okText: string;
  badText: string;
}) {
  return (
    <div className="flex items-center gap-2 rounded-lg border p-3">
      <span
        className={`grid size-7 place-items-center rounded-full ${
          ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
        }`}
      >
        {ok ? <Check className="size-4" /> : <X className="size-4" />}
      </span>
      <div className="text-sm">
        <p className="font-medium">{label}</p>
        <p className="text-xs text-muted-foreground">{ok ? okText : badText}</p>
      </div>
    </div>
  );
}

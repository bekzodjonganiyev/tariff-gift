import { Badge } from "@/components/ui/badge";

export type TelegramLog = {
  id: string;
  application_id: string | null;
  action: string | null;
  actor_telegram_id: string | null;
  status: string;
  error_message: string | null;
  created_at: string;
};

function statusVariant(
  status: string,
): "default" | "secondary" | "destructive" | "outline" {
  if (status === "sent" || status === "approved") return "default";
  if (status === "rejected") return "secondary";
  if (status.includes("failed")) return "destructive";
  return "outline";
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function TelegramLogs({ logs }: { logs: TelegramLog[] }) {
  if (logs.length === 0) {
    return (
      <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
        No notifications sent yet.
      </p>
    );
  }

  return (
    <div className="divide-y rounded-xl border">
      {logs.map((log) => (
        <div
          key={log.id}
          className="flex flex-wrap items-center justify-between gap-3 p-3 text-sm"
        >
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-medium">
              <span className="capitalize">{log.action ?? "event"}</span>
              <Badge variant={statusVariant(log.status)}>{log.status}</Badge>
            </p>
            <p className="text-xs text-muted-foreground">
              {fmt(log.created_at)}
              {log.actor_telegram_id ? ` · by ${log.actor_telegram_id}` : ""}
              {log.error_message ? ` · ${log.error_message}` : ""}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

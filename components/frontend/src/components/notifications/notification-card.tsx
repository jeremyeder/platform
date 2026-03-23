"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import type { Notification, NotificationType } from "@/hooks/use-notifications";

const borderColors: Record<NotificationType, string> = {
  waiting_input: "border-l-amber-500",
  completed: "border-l-green-500",
  failed: "border-l-red-500",
  stopped: "border-l-gray-400",
};

const typeLabels: Record<NotificationType, string> = {
  waiting_input: "Waiting for input",
  completed: "Completed",
  failed: "Failed",
  stopped: "Stopped",
};

type NotificationCardProps = {
  notification: Notification;
  onDismiss?: () => void;
};

export function NotificationCard({ notification, onDismiss }: NotificationCardProps) {
  const { sessionName, displayName, projectName, type, timestamp } =
    notification;

  const label = displayName || sessionName;
  const timeAgo = formatDistanceToNow(new Date(timestamp), {
    addSuffix: true,
  });

  return (
    <Link
      href={`/projects/${encodeURIComponent(projectName)}/sessions/${encodeURIComponent(sessionName)}`}
      onClick={onDismiss}
      className={cn(
        "block rounded-md border-l-4 bg-muted/40 px-3 py-2 transition-colors hover:bg-muted/80",
        borderColors[type]
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{typeLabels[type]}</p>
        </div>
        <span className="shrink-0 text-[10px] text-muted-foreground">
          {timeAgo}
        </span>
      </div>
    </Link>
  );
}

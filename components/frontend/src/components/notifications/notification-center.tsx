"use client";

import { useState } from "react";
import { Gift } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNotifications, type Notification } from "@/hooks/use-notifications";
import { NotificationCard } from "./notification-card";

function groupByProject(
  notifications: Notification[]
): Record<string, Notification[]> {
  const groups: Record<string, Notification[]> = {};
  for (const n of notifications) {
    if (!groups[n.projectName]) {
      groups[n.projectName] = [];
    }
    groups[n.projectName].push(n);
  }
  return groups;
}

export function NotificationCenter() {
  const { notifications, unreadCount, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen) {
      markAllRead();
    }
  };

  const grouped = groupByProject(notifications);
  const projectNames = Object.keys(grouped).sort();

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label="Notifications"
        >
          <Gift className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-amber-200">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[380px] max-h-[480px] overflow-y-auto p-0"
      >
        <div className="sticky top-0 z-10 border-b bg-popover px-4 py-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Notifications</h3>
            {notifications.length > 0 && (
              <span className="text-xs text-muted-foreground">
                {notifications.length}{" "}
                {notifications.length === 1 ? "session" : "sessions"}
              </span>
            )}
          </div>
        </div>
        <div className="p-2">
          {notifications.length === 0 ? (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No notifications
            </p>
          ) : (
            projectNames.map((projectName) => (
              <div key={projectName} className="mb-2 last:mb-0">
                <p className="px-2 py-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  {projectName}
                </p>
                <div className="flex flex-col gap-1">
                  {grouped[projectName].map((notification) => (
                    <NotificationCard
                      key={notification.sessionUid}
                      notification={notification}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

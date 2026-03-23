import { useMemo, useCallback, useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { useProjects } from "@/services/queries/use-projects";
import { listSessionsPaginated } from "@/services/api/sessions";
import type { AgenticSession } from "@/types/api";

export type NotificationType =
  | "waiting_input"
  | "completed"
  | "failed"
  | "stopped";

export type Notification = {
  sessionUid: string;
  sessionName: string;
  displayName?: string;
  projectName: string;
  type: NotificationType;
  timestamp: string;
};

const STORAGE_KEY = "acp-notifications-dismissed";
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RECENT_WINDOW_MS = 30 * 60 * 1000; // 30 minutes

function getDismissed(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    const now = Date.now();
    const pruned: Record<string, number> = {};
    let changed = false;
    for (const [uid, ts] of Object.entries(parsed)) {
      if (now - ts < TTL_MS) {
        pruned[uid] = ts;
      } else {
        changed = true;
      }
    }
    if (changed) {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pruned));
    }
    return pruned;
  } catch {
    return {};
  }
}

function setDismissedBatch(uids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const current = getDismissed();
    const now = Date.now();
    for (const uid of uids) {
      current[uid] = now;
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    /* localStorage may be unavailable */
  }
}

function getNotificationType(
  session: AgenticSession
): NotificationType | null {
  const status = session.status;
  if (!status) return null;

  if (status.agentStatus === "waiting_input") {
    return "waiting_input";
  }

  const phase = status.phase;
  if (phase === "Completed" || phase === "Failed" || phase === "Stopped") {
    const ts = status.completionTime || status.lastActivityTime;
    if (ts) {
      const age = Date.now() - new Date(ts).getTime();
      if (age < RECENT_WINDOW_MS) {
        return phase.toLowerCase() as NotificationType;
      }
    }
  }

  return null;
}

function sessionToNotification(
  session: AgenticSession,
  projectName: string
): Notification | null {
  const type = getNotificationType(session);
  if (!type) return null;

  const timestamp =
    type === "waiting_input"
      ? session.status?.lastActivityTime ||
        session.metadata.creationTimestamp
      : session.status?.completionTime ||
        session.status?.lastActivityTime ||
        session.metadata.creationTimestamp;

  return {
    sessionUid: session.metadata.uid,
    sessionName: session.metadata.name,
    displayName: session.spec.displayName,
    projectName,
    type,
    timestamp,
  };
}

export function useNotifications() {
  const [dismissedVersion, setDismissedVersion] = useState(0);
  const { data: projects } = useProjects();

  const projectNames = useMemo(
    () => (projects ?? []).map((p) => p.name),
    [projects]
  );

  const sessionQueries = useQueries({
    queries: projectNames.map((projectName) => ({
      queryKey: ["notifications", "sessions", projectName],
      queryFn: () => listSessionsPaginated(projectName, { limit: 50 }),
      refetchInterval: 30_000 + Math.random() * 5_000,
      staleTime: 20_000,
    })),
  });

  const notifications = useMemo(() => {
    const result: Notification[] = [];
    sessionQueries.forEach((query, index) => {
      if (!query.data?.items) return;
      const projectName = projectNames[index];
      for (const session of query.data.items) {
        const notification = sessionToNotification(session, projectName);
        if (notification) {
          result.push(notification);
        }
      }
    });
    // Sort: waiting_input first, then by timestamp desc
    result.sort((a, b) => {
      if (a.type === "waiting_input" && b.type !== "waiting_input") return -1;
      if (a.type !== "waiting_input" && b.type === "waiting_input") return 1;
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });
    return result;
  }, [sessionQueries, projectNames]);

  const unreadCount = useMemo(() => {
    const dismissed = getDismissed();
    return notifications.filter((n) => !dismissed[n.sessionUid]).length;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dismissedVersion triggers recomputation after markAllRead
  }, [notifications, dismissedVersion]);

  const markAllRead = useCallback(() => {
    setDismissedBatch(notifications.map((n) => n.sessionUid));
    setDismissedVersion((v) => v + 1);
  }, [notifications]);

  const dismissNotification = useCallback((uid: string) => {
    setDismissedBatch([uid]);
    setDismissedVersion((v) => v + 1);
  }, []);

  return {
    notifications,
    unreadCount,
    markAllRead,
    dismissNotification,
  };
}

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { useNotifications } from "../use-notifications";

vi.mock("@/services/queries/use-projects", () => ({
  useProjects: vi.fn(),
}));

vi.mock("@/services/api/sessions", () => ({
  listSessionsPaginated: vi.fn(),
}));

import { useProjects } from "@/services/queries/use-projects";
import { listSessionsPaginated } from "@/services/api/sessions";

const mockUseProjects = vi.mocked(useProjects);
const mockListSessions = vi.mocked(listSessionsPaginated);

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    metadata: {
      name: "session-1",
      namespace: "default",
      uid: "uid-1",
      creationTimestamp: "2026-03-21T00:00:00Z",
    },
    spec: {
      displayName: "Test Session",
      llmSettings: { model: "claude-sonnet-4-20250514", temperature: 0, maxTokens: 100 },
      timeout: 3600,
    },
    status: { phase: "Running" as const },
    ...overrides,
  };
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("useNotifications", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("returns empty notifications when no projects", async () => {
    mockUseProjects.mockReturnValue({ data: [] } as unknown as ReturnType<typeof useProjects>);

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    expect(result.current.notifications).toEqual([]);
    expect(result.current.unreadCount).toBe(0);
  });

  it("detects waiting_input sessions", async () => {
    mockUseProjects.mockReturnValue({
      data: [{ name: "proj-1" }],
    } as unknown as ReturnType<typeof useProjects>);

    mockListSessions.mockResolvedValue({
      items: [
        makeSession({
          status: { phase: "Running", agentStatus: "waiting_input", lastActivityTime: new Date().toISOString() },
        }),
      ],
      totalCount: 1,
      limit: 50,
      offset: 0,
      hasMore: false,
    });

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(1);
    });

    expect(result.current.notifications[0].type).toBe("waiting_input");
    expect(result.current.notifications[0].projectName).toBe("proj-1");
    expect(result.current.unreadCount).toBe(1);
  });

  it("detects recently completed sessions", async () => {
    mockUseProjects.mockReturnValue({
      data: [{ name: "proj-1" }],
    } as unknown as ReturnType<typeof useProjects>);

    mockListSessions.mockResolvedValue({
      items: [
        makeSession({
          status: {
            phase: "Completed",
            completionTime: new Date().toISOString(),
          },
        }),
      ],
      totalCount: 1,
      limit: 50,
      offset: 0,
      hasMore: false,
    });

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(1);
    });

    expect(result.current.notifications[0].type).toBe("completed");
  });

  it("ignores old completed sessions", async () => {
    mockUseProjects.mockReturnValue({
      data: [{ name: "proj-1" }],
    } as unknown as ReturnType<typeof useProjects>);

    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    mockListSessions.mockResolvedValue({
      items: [
        makeSession({
          status: { phase: "Completed", completionTime: twoHoursAgo },
        }),
      ],
      totalCount: 1,
      limit: 50,
      offset: 0,
      hasMore: false,
    });

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.notifications).toHaveLength(0);
    });
  });

  it("markAllRead clears unread count", async () => {
    mockUseProjects.mockReturnValue({
      data: [{ name: "proj-1" }],
    } as unknown as ReturnType<typeof useProjects>);

    mockListSessions.mockResolvedValue({
      items: [
        makeSession({
          status: { phase: "Running", agentStatus: "waiting_input", lastActivityTime: new Date().toISOString() },
        }),
      ],
      totalCount: 1,
      limit: 50,
      offset: 0,
      hasMore: false,
    });

    const { result } = renderHook(() => useNotifications(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.unreadCount).toBe(1);
    });

    act(() => {
      result.current.markAllRead();
    });

    // After marking read, unread count should be 0 on next render
    await waitFor(() => {
      expect(result.current.unreadCount).toBe(0);
    });
  });
});

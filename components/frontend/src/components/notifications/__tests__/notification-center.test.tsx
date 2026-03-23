import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NotificationCenter } from "../notification-center";

const mockMarkAllRead = vi.fn();

vi.mock("@/hooks/use-notifications", () => ({
  useNotifications: vi.fn(),
}));

vi.mock("date-fns", () => ({
  formatDistanceToNow: () => "2 minutes ago",
}));

import { useNotifications } from "@/hooks/use-notifications";
const mockUseNotifications = vi.mocked(useNotifications);

describe("NotificationCenter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders gift icon button", () => {
    mockUseNotifications.mockReturnValue({
      notifications: [],
      unreadCount: 0,
      markAllRead: mockMarkAllRead,
      dismissNotification: vi.fn(),
    });

    render(<NotificationCenter />);
    expect(screen.getByLabelText("Notifications")).toBeDefined();
  });

  it("shows badge when unread count > 0", () => {
    mockUseNotifications.mockReturnValue({
      notifications: [
        {
          sessionUid: "uid-1",
          sessionName: "s1",
          displayName: "Session 1",
          projectName: "proj-1",
          type: "waiting_input",
          timestamp: "2026-03-21T00:00:00Z",
        },
      ],
      unreadCount: 3,
      markAllRead: mockMarkAllRead,
      dismissNotification: vi.fn(),
    });

    render(<NotificationCenter />);
    expect(screen.getByText("3")).toBeDefined();
  });

  it("does not show badge when unread count is 0", () => {
    mockUseNotifications.mockReturnValue({
      notifications: [],
      unreadCount: 0,
      markAllRead: mockMarkAllRead,
      dismissNotification: vi.fn(),
    });

    render(<NotificationCenter />);
    expect(screen.queryByText("0")).toBeNull();
  });

  it("shows empty state when no notifications", () => {
    mockUseNotifications.mockReturnValue({
      notifications: [],
      unreadCount: 0,
      markAllRead: mockMarkAllRead,
      dismissNotification: vi.fn(),
    });

    render(<NotificationCenter />);
    fireEvent.click(screen.getByLabelText("Notifications"));
    expect(screen.getByText("No notifications")).toBeDefined();
  });

  it("shows Mark all read button when there are unread notifications", () => {
    mockUseNotifications.mockReturnValue({
      notifications: [
        {
          sessionUid: "uid-1",
          sessionName: "s1",
          displayName: "Session 1",
          projectName: "proj-1",
          type: "completed",
          timestamp: "2026-03-21T00:00:00Z",
        },
      ],
      unreadCount: 1,
      markAllRead: mockMarkAllRead,
      dismissNotification: vi.fn(),
    });

    render(<NotificationCenter />);
    fireEvent.click(screen.getByLabelText("Notifications"));
    const markAllReadButton = screen.getByText("Mark all read");
    expect(markAllReadButton).toBeDefined();
    fireEvent.click(markAllReadButton);
    expect(mockMarkAllRead).toHaveBeenCalled();
  });

  it("groups notifications by project name", () => {
    mockUseNotifications.mockReturnValue({
      notifications: [
        {
          sessionUid: "uid-1",
          sessionName: "s1",
          displayName: "Session 1",
          projectName: "alpha-project",
          type: "waiting_input",
          timestamp: "2026-03-21T00:00:00Z",
        },
        {
          sessionUid: "uid-2",
          sessionName: "s2",
          displayName: "Session 2",
          projectName: "beta-project",
          type: "failed",
          timestamp: "2026-03-21T00:00:00Z",
        },
      ],
      unreadCount: 2,
      markAllRead: mockMarkAllRead,
      dismissNotification: vi.fn(),
    });

    render(<NotificationCenter />);
    fireEvent.click(screen.getByLabelText("Notifications"));
    expect(screen.getByText("alpha-project")).toBeDefined();
    expect(screen.getByText("beta-project")).toBeDefined();
  });

  it("caps badge at 99+", () => {
    mockUseNotifications.mockReturnValue({
      notifications: [],
      unreadCount: 150,
      markAllRead: mockMarkAllRead,
      dismissNotification: vi.fn(),
    });

    render(<NotificationCenter />);
    expect(screen.getByText("99+")).toBeDefined();
  });
});

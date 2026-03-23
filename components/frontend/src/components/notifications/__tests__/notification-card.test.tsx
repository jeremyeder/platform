import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NotificationCard } from "../notification-card";
import type { Notification } from "@/hooks/use-notifications";

vi.mock("date-fns", () => ({
  formatDistanceToNow: () => "5 minutes ago",
}));

function makeNotification(
  overrides: Partial<Notification> = {}
): Notification {
  return {
    sessionUid: "uid-1",
    sessionName: "session-1",
    displayName: "My Session",
    projectName: "proj-1",
    type: "waiting_input",
    timestamp: "2026-03-21T00:00:00Z",
    ...overrides,
  };
}

describe("NotificationCard", () => {
  it("renders display name and project type label", () => {
    render(<NotificationCard notification={makeNotification()} />);
    expect(screen.getByText("My Session")).toBeDefined();
    expect(screen.getByText("Waiting for input")).toBeDefined();
  });

  it("falls back to session name when no display name", () => {
    render(
      <NotificationCard
        notification={makeNotification({ displayName: undefined })}
      />
    );
    expect(screen.getByText("session-1")).toBeDefined();
  });

  it("renders completed type", () => {
    render(
      <NotificationCard
        notification={makeNotification({ type: "completed" })}
      />
    );
    expect(screen.getByText("Completed")).toBeDefined();
  });

  it("renders failed type", () => {
    render(
      <NotificationCard notification={makeNotification({ type: "failed" })} />
    );
    expect(screen.getByText("Failed")).toBeDefined();
  });

  it("renders stopped type", () => {
    render(
      <NotificationCard notification={makeNotification({ type: "stopped" })} />
    );
    expect(screen.getByText("Stopped")).toBeDefined();
  });

  it("links to session page", () => {
    render(<NotificationCard notification={makeNotification()} />);
    const link = screen.getByRole("link");
    expect(link.getAttribute("href")).toBe(
      "/projects/proj-1/sessions/session-1"
    );
  });

  it("shows relative timestamp", () => {
    render(<NotificationCard notification={makeNotification()} />);
    expect(screen.getByText("5 minutes ago")).toBeDefined();
  });
});

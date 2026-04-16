import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AdvancedSdkOptions } from "../advanced-sdk-options";
import {
  claudeAgentOptionsSchema,
  claudeAgentOptionsDefaults,
  type ClaudeAgentOptionsForm,
} from "../claude-agent-options";

// Mock useWorkspaceFlag
const mockUseWorkspaceFlag = vi.fn(() => ({
  enabled: false,
  isLoading: false,
  error: null,
  source: undefined,
}));
vi.mock("@/services/queries/use-feature-flags-admin", () => ({
  useWorkspaceFlag: (...args: unknown[]) => mockUseWorkspaceFlag(...args),
}));

// Mock AgentOptionsFields to avoid rendering the full form tree
vi.mock("../claude-agent-options", async () => {
  const actual = await vi.importActual("../claude-agent-options");
  return {
    ...actual,
    AgentOptionsFields: ({ disabled }: { disabled?: boolean }) => (
      <div data-testid="agent-options-fields" data-disabled={disabled}>
        Agent Options Fields
      </div>
    ),
  };
});

// Helper to render the component with a form
function renderWithForm(props?: { disabled?: boolean }) {
  function TestHarness() {
    const form = useForm<ClaudeAgentOptionsForm>({
      resolver: zodResolver(claudeAgentOptionsSchema),
      defaultValues: claudeAgentOptionsDefaults,
    });
    return (
      <AdvancedSdkOptions
        projectName="test-project"
        form={form}
        disabled={props?.disabled}
      />
    );
  }
  return render(<TestHarness />);
}

describe("AdvancedSdkOptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders nothing when advanced-sdk-options flag is false", () => {
    mockUseWorkspaceFlag.mockReturnValue({
      enabled: false,
      isLoading: false,
      error: null,
      source: undefined,
    });

    const { container } = renderWithForm();
    expect(container.innerHTML).toBe("");
  });

  it("renders collapsed by default when flag is true", () => {
    mockUseWorkspaceFlag.mockReturnValue({
      enabled: true,
      isLoading: false,
      error: null,
      source: undefined,
    });

    renderWithForm();
    expect(screen.getByText("Advanced SDK Options")).toBeDefined();
    // The form fields should NOT be visible when collapsed
    expect(screen.queryByTestId("agent-options-fields")).toBeNull();
  });

  it("expands on click to show form fields", () => {
    mockUseWorkspaceFlag.mockReturnValue({
      enabled: true,
      isLoading: false,
      error: null,
      source: undefined,
    });

    renderWithForm();
    const trigger = screen.getByText("Advanced SDK Options");
    fireEvent.click(trigger);

    expect(screen.getByTestId("agent-options-fields")).toBeDefined();
  });

  it("shows form fields when expanded", () => {
    mockUseWorkspaceFlag.mockReturnValue({
      enabled: true,
      isLoading: false,
      error: null,
      source: undefined,
    });

    renderWithForm();
    // Click to expand
    fireEvent.click(screen.getByText("Advanced SDK Options"));

    const fields = screen.getByTestId("agent-options-fields");
    expect(fields).toBeDefined();
    expect(fields.textContent).toContain("Agent Options Fields");
  });

  it("calls useWorkspaceFlag with correct project and flag name", () => {
    mockUseWorkspaceFlag.mockReturnValue({
      enabled: false,
      isLoading: false,
      error: null,
      source: undefined,
    });

    renderWithForm();
    expect(mockUseWorkspaceFlag).toHaveBeenCalledWith(
      "test-project",
      "advanced-sdk-options"
    );
  });
});

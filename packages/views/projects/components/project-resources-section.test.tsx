import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { I18nProvider } from "@multica/core/i18n/react";
import type { ProjectResource } from "@multica/core/types";
import { RESOURCES } from "../../locales";

vi.mock("@multica/core/hooks", () => ({
  useWorkspaceId: () => "ws-1",
}));

vi.mock("@multica/core/paths", () => ({
  useCurrentWorkspace: () => undefined,
}));

vi.mock("../../platform", () => ({
  isDesktopShell: () => false,
  pickDirectory: vi.fn(),
  useLocalDaemonStatus: () => ({
    daemonId: null,
    deviceName: null,
    running: false,
  }),
  validateLocalDirectory: vi.fn(),
}));

// Popover uses Base UI's controlled open state + portal, which isn't worth
// driving through real pointer interactions here — mirror the mocking
// pattern from issue-agent-header-chip.test.tsx and render trigger +
// content unconditionally so the add-link form is always queryable.
vi.mock("@multica/ui/components/ui/popover", async () => {
  const React = await vi.importActual<typeof import("react")>("react");
  return {
    Popover: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="resources-popover">{children}</div>
    ),
    PopoverTrigger: ({
      render,
      children,
    }: {
      render: React.ReactElement;
      children?: React.ReactNode;
    }) => React.cloneElement(render, undefined, children),
    PopoverContent: ({ children }: { children: React.ReactNode }) => (
      <div data-testid="resources-popover-content">{children}</div>
    ),
  };
});

const mockListResources = vi.hoisted(() => vi.fn());
const mockCreateResource = vi.hoisted(() => vi.fn());
const mockUpdateResource = vi.hoisted(() => vi.fn());
const mockDeleteResource = vi.hoisted(() => vi.fn());

vi.mock("@multica/core/api", () => ({
  api: {
    listProjectResources: (...args: unknown[]) => mockListResources(...args),
    createProjectResource: (...args: unknown[]) => mockCreateResource(...args),
    updateProjectResource: (...args: unknown[]) => mockUpdateResource(...args),
    deleteProjectResource: (...args: unknown[]) => mockDeleteResource(...args),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Import AFTER mocks are registered.
import { toast } from "sonner";
import { ProjectResourcesSection } from "./project-resources-section";

function renderSection(projectId = "proj-1") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <I18nProvider locale="en" resources={RESOURCES}>
        <ProjectResourcesSection projectId={projectId} />
      </I18nProvider>
    </QueryClientProvider>,
  );
}

function makeLinkResource(overrides: {
  id?: string;
  url: string;
  label: string;
}): ProjectResource {
  return {
    id: overrides.id ?? `res-${overrides.url}`,
    project_id: "proj-1",
    workspace_id: "ws-1",
    resource_type: "link",
    resource_ref: { url: overrides.url },
    label: overrides.label,
    position: 0,
    created_at: new Date(0).toISOString(),
    created_by: null,
  };
}

describe("ProjectResourcesSection - link resources", () => {
  beforeEach(() => {
    mockListResources.mockReset();
    mockCreateResource.mockReset();
    mockUpdateResource.mockReset();
    mockDeleteResource.mockReset();
    vi.mocked(toast.success).mockClear();
    vi.mocked(toast.error).mockClear();
  });

  it("renders an existing link resource as an out-bound link with its label", async () => {
    mockListResources.mockResolvedValue({
      resources: [
        makeLinkResource({
          url: "https://drive.google.com/drive/folders/abc",
          label: "Design assets",
        }),
      ],
      total: 1,
    });
    renderSection();

    const link = await screen.findByRole("link", { name: "Design assets" });
    expect(link).toHaveAttribute(
      "href",
      "https://drive.google.com/drive/folders/abc",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("keeps the add-link submit button disabled until both label and url are filled", async () => {
    mockListResources.mockResolvedValue({ resources: [], total: 0 });
    renderSection();

    const labelInput = await screen.findByPlaceholderText("Label");
    const form = labelInput.closest("form");
    if (!form) throw new Error("expected label input to be inside a form");
    const submit = within(form).getByRole("button", { name: "Add" });
    const urlInput = within(form).getByPlaceholderText("https://...");

    expect(submit).toBeDisabled();

    const user = userEvent.setup();
    await user.type(labelInput, "Design assets");
    expect(submit).toBeDisabled();

    await user.type(urlInput, "https://drive.google.com/drive/folders/abc");
    expect(submit).toBeEnabled();
  });

  it("submits a link resource and clears the form on success", async () => {
    mockListResources.mockResolvedValue({ resources: [], total: 0 });
    const created = makeLinkResource({
      url: "https://drive.google.com/drive/folders/abc",
      label: "Design assets",
    });
    mockCreateResource.mockResolvedValue(created);
    renderSection();

    const labelInput = await screen.findByPlaceholderText("Label");
    const form = labelInput.closest("form");
    if (!form) throw new Error("expected label input to be inside a form");
    const urlInput = within(form).getByPlaceholderText("https://...");
    const submit = within(form).getByRole("button", { name: "Add" });

    const user = userEvent.setup();
    await user.type(labelInput, "Design assets");
    await user.type(urlInput, "https://drive.google.com/drive/folders/abc");
    await user.click(submit);

    await waitFor(() => {
      expect(mockCreateResource).toHaveBeenCalledWith("proj-1", {
        resource_type: "link",
        resource_ref: { url: "https://drive.google.com/drive/folders/abc" },
        label: "Design assets",
      });
    });
    expect(toast.success).toHaveBeenCalledWith("Link attached");
    await waitFor(() => {
      expect(labelInput).toHaveValue("");
      expect(urlInput).toHaveValue("");
    });
  });

  it("shows an error toast with the server message when the create request fails", async () => {
    // handleAttachLink swallows the rejection and surfaces it as a toast —
    // same contract as the existing github_repo handleAttach — so the form
    // still resets on settle; only the toast distinguishes success/failure.
    mockListResources.mockResolvedValue({ resources: [], total: 0 });
    mockCreateResource.mockRejectedValue(new Error("boom"));
    renderSection();

    const labelInput = await screen.findByPlaceholderText("Label");
    const form = labelInput.closest("form");
    if (!form) throw new Error("expected label input to be inside a form");
    const urlInput = within(form).getByPlaceholderText("https://...");
    const submit = within(form).getByRole("button", { name: "Add" });

    const user = userEvent.setup();
    await user.type(labelInput, "Design assets");
    await user.type(urlInput, "https://drive.google.com/drive/folders/abc");
    await user.click(submit);

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith("boom");
    });
  });

  it("removes a link resource and shows the generic removed toast", async () => {
    mockListResources.mockResolvedValue({
      resources: [
        makeLinkResource({
          id: "res-1",
          url: "https://drive.google.com/drive/folders/abc",
          label: "Design assets",
        }),
      ],
      total: 1,
    });
    mockDeleteResource.mockResolvedValue(undefined);
    renderSection();

    const link = await screen.findByRole("link", { name: "Design assets" });
    const row = link.closest("div");
    if (!row) throw new Error("expected link to be inside a row container");
    const removeButton = within(row).getByTitle("Remove");

    const user = userEvent.setup();
    await user.click(removeButton);

    await waitFor(() => {
      expect(mockDeleteResource).toHaveBeenCalledWith("proj-1", "res-1");
    });
    expect(toast.success).toHaveBeenCalledWith("Resource removed");
  });
});

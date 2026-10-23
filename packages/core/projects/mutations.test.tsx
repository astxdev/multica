/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { setApiInstance } from "../api";
import type { ApiClient } from "../api/client";
import { setCurrentWorkspace } from "../platform/workspace-storage";
import {
  getIssueSurfaceViewStore,
  pruneIssueSurfaceViewStates,
} from "../issues/stores/surface-view-store";
import {
  useArchiveProject,
  useDeleteProject,
  useRestoreProject,
} from "./mutations";
import { projectKeys } from "./queries";

vi.mock("../hooks", () => ({
  useWorkspaceId: () => "ws-1",
}));

function createWrapper(qc: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe("useDeleteProject", () => {
  let qc: QueryClient;
  let deleteProject: ReturnType<typeof vi.fn<() => Promise<void>>>;

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    deleteProject = vi.fn().mockResolvedValue(undefined);
    setApiInstance({ deleteProject } as unknown as ApiClient);
    setCurrentWorkspace("acme", "ws-1");
  });

  afterEach(() => {
    qc.clear();
    pruneIssueSurfaceViewStates([]);
    setCurrentWorkspace(null, null);
    vi.restoreAllMocks();
  });

  it("clears the deleted project's issue surface view state", async () => {
    const store = getIssueSurfaceViewStore("project:p1");
    store.getState().setViewMode("list");
    expect(store.getState().viewMode).toBe("list");

    const { result } = renderHook(() => useDeleteProject(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      await result.current.mutateAsync("p1");
    });

    expect(deleteProject).toHaveBeenCalledWith("p1");
    expect(store.getState().viewMode).toBe("board");
  });
});

// Archive/restore move a project between the two list variants, so neither
// list can be patched locally — both must be invalidated. projectKeys.list is
// a prefix of projectKeys.listWithArchived, so one invalidation at the `all`
// level has to reach both.
describe("useArchiveProject / useRestoreProject", () => {
  let qc: QueryClient;
  let archiveProject: ReturnType<typeof vi.fn<() => Promise<unknown>>>;
  let restoreProject: ReturnType<typeof vi.fn<() => Promise<unknown>>>;

  beforeEach(() => {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    archiveProject = vi.fn().mockResolvedValue({ id: "p1" });
    restoreProject = vi.fn().mockResolvedValue({ id: "p1" });
    setApiInstance({ archiveProject, restoreProject } as unknown as ApiClient);
    setCurrentWorkspace("acme", "ws-1");
  });

  afterEach(() => {
    qc.clear();
    setCurrentWorkspace(null, null);
    vi.restoreAllMocks();
  });

  function seedBothLists() {
    qc.setQueryData(projectKeys.list("ws-1"), { projects: [], total: 0 });
    qc.setQueryData(projectKeys.listWithArchived("ws-1"), {
      projects: [],
      total: 0,
    });
  }

  function staleFlags() {
    return [
      qc.getQueryState(projectKeys.list("ws-1"))?.isInvalidated,
      qc.getQueryState(projectKeys.listWithArchived("ws-1"))?.isInvalidated,
    ];
  }

  it("invalidates both the active and the archived list on archive", async () => {
    seedBothLists();
    const { result } = renderHook(() => useArchiveProject(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      await result.current.mutateAsync("p1");
    });

    expect(archiveProject).toHaveBeenCalledWith("p1");
    expect(staleFlags()).toEqual([true, true]);
  });

  it("invalidates both lists on restore", async () => {
    seedBothLists();
    const { result } = renderHook(() => useRestoreProject(), {
      wrapper: createWrapper(qc),
    });

    await act(async () => {
      await result.current.mutateAsync("p1");
    });

    expect(restoreProject).toHaveBeenCalledWith("p1");
    expect(staleFlags()).toEqual([true, true]);
  });
});

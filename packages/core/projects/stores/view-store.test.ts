// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useProjectViewStore } from "./view-store";
import { setCurrentWorkspace } from "../../platform/workspace-storage";

const flush = () => new Promise((resolve) => queueMicrotask(() => resolve(null)));

// Node 25 ships a partial `localStorage` shim under jsdom that's missing
// `clear`/`removeItem`; replace it with a real in-memory Storage so persist
// can round-trip values.
beforeAll(() => {
  if (typeof globalThis.localStorage?.clear !== "function") {
    const values = new Map<string, string>();
    const storage: Storage = {
      get length() { return values.size; },
      clear: () => values.clear(),
      getItem: (k) => values.get(k) ?? null,
      key: (i) => Array.from(values.keys())[i] ?? null,
      removeItem: (k) => { values.delete(k); },
      setItem: (k, v) => { values.set(k, v); },
    };
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
    Object.defineProperty(window, "localStorage", { configurable: true, value: storage });
  }
});

beforeEach(() => {
  localStorage.clear();
  useProjectViewStore.setState({ viewMode: "compact", showArchived: false });
  setCurrentWorkspace(null, null);
});

afterEach(() => {
  setCurrentWorkspace(null, null);
});

describe("useProjectViewStore", () => {
  it("defaults to 'compact'", () => {
    expect(useProjectViewStore.getState().viewMode).toBe("compact");
  });

  it("setViewMode mutates the store", () => {
    useProjectViewStore.getState().setViewMode("comfortable");
    expect(useProjectViewStore.getState().viewMode).toBe("comfortable");
  });

  it("hides archived projects by default and toggles back and forth", () => {
    expect(useProjectViewStore.getState().showArchived).toBe(false);

    useProjectViewStore.getState().toggleShowArchived();
    expect(useProjectViewStore.getState().showArchived).toBe(true);

    useProjectViewStore.getState().toggleShowArchived();
    expect(useProjectViewStore.getState().showArchived).toBe(false);
  });

  // A persisted showArchived would strand the user in the archived view across
  // sessions with no visible cause, so it stays session-local. The partialize
  // assertion below is the other half of this guarantee.
  it("does not persist showArchived", async () => {
    setCurrentWorkspace("acme", "ws_a");
    await flush();
    useProjectViewStore.getState().toggleShowArchived();
    expect(useProjectViewStore.getState().showArchived).toBe(true);

    const raw = localStorage.getItem("multica_projects_view:acme");
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string).state).not.toHaveProperty("showArchived");
  });

  // clearFilters is the "Reset filters" affordance; showArchived is a display
  // mode, not a filter dimension, so resetting must leave it alone.
  it("clearFilters leaves showArchived untouched", () => {
    useProjectViewStore.getState().toggleShowArchived();
    useProjectViewStore.getState().clearFilters();
    expect(useProjectViewStore.getState().showArchived).toBe(true);
  });

  it("partialize persists view prefs (no actions) under the workspace-namespaced key", async () => {
    setCurrentWorkspace("acme", "ws_a");
    await flush();
    useProjectViewStore.getState().setViewMode("comfortable");

    const raw = localStorage.getItem("multica_projects_view:acme");
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw as string);
    expect(Object.keys(parsed.state).sort()).toEqual([
      "filters",
      "hiddenColumns",
      "sortDirection",
      "sortField",
      "viewMode",
    ]);
    expect(parsed.state.viewMode).toBe("comfortable");
  });

  it("rehydrates a different saved viewMode on workspace switch", async () => {
    localStorage.setItem(
      "multica_projects_view:acme",
      JSON.stringify({ state: { viewMode: "comfortable" }, version: 0 }),
    );
    localStorage.setItem(
      "multica_projects_view:beta",
      JSON.stringify({ state: { viewMode: "compact" }, version: 0 }),
    );

    setCurrentWorkspace("acme", "ws_a");
    await flush();
    await flush();
    expect(useProjectViewStore.getState().viewMode).toBe("comfortable");

    setCurrentWorkspace("beta", "ws_b");
    await flush();
    await flush();
    expect(useProjectViewStore.getState().viewMode).toBe("compact");
  });

  it("resets to 'compact' when switching to a workspace with no persisted value", async () => {
    localStorage.setItem(
      "multica_projects_view:acme",
      JSON.stringify({ state: { viewMode: "comfortable" }, version: 0 }),
    );

    setCurrentWorkspace("acme", "ws_a");
    await flush();
    await flush();
    expect(useProjectViewStore.getState().viewMode).toBe("comfortable");

    setCurrentWorkspace("beta", "ws_b");
    await flush();
    await flush();
    expect(useProjectViewStore.getState().viewMode).toBe("compact");
    expect(localStorage.getItem("multica_projects_view:acme")).not.toBeNull();
  });
});

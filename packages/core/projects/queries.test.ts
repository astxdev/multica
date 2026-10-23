import { describe, expect, it, vi } from "vitest";
import { setApiInstance } from "../api";
import type { ApiClient } from "../api/client";
import { projectKeys, projectListOptions } from "./queries";

describe("projectListOptions", () => {
  function stubApi() {
    const listProjects = vi
      .fn()
      .mockResolvedValue({ projects: [], total: 0 });
    setApiInstance({ listProjects } as unknown as ApiClient);
    return listProjects;
  }

  it("asks for active projects only by default", async () => {
    const listProjects = stubApi();
    const opts = projectListOptions("ws-1");

    expect(opts.queryKey).toEqual(projectKeys.list("ws-1"));
    await opts.queryFn?.({} as never);
    expect(listProjects).toHaveBeenCalledWith(undefined);
  });

  it("opts into archived projects only when asked", async () => {
    const listProjects = stubApi();
    const opts = projectListOptions("ws-1", { includeArchived: true });

    expect(opts.queryKey).toEqual(projectKeys.listWithArchived("ws-1"));
    await opts.queryFn?.({} as never);
    expect(listProjects).toHaveBeenCalledWith({ include_archived: true });
  });

  // The two variants must not share a cache entry: pickers read the active
  // list, and archived projects leaking into it would make them selectable
  // again.
  it("keys the two variants separately", () => {
    expect(projectKeys.listWithArchived("ws-1")).not.toEqual(
      projectKeys.list("ws-1"),
    );
  });

  // ...but the archived key stays *under* the active one, so the existing
  // invalidateQueries({ queryKey: list }) prefix match still refreshes both.
  it("nests the archived key under the active list key", () => {
    const list = projectKeys.list("ws-1");
    expect(projectKeys.listWithArchived("ws-1").slice(0, list.length)).toEqual([
      ...list,
    ]);
  });

  // includeArchived: false must behave exactly like omitting the option —
  // otherwise every default caller would silently get a second cache entry.
  it("treats an explicit false like the default", () => {
    expect(
      projectListOptions("ws-1", { includeArchived: false }).queryKey,
    ).toEqual(projectKeys.list("ws-1"));
  });

  it("scopes keys per workspace", () => {
    expect(projectKeys.list("ws-1")).not.toEqual(projectKeys.list("ws-2"));
  });
});

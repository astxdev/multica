import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const projectKeys = {
  all: (wsId: string) => ["projects", wsId] as const,
  list: (wsId: string) => [...projectKeys.all(wsId), "list"] as const,
  // The archived-inclusive list is a separate cache entry, not the same list
  // with extra rows: pickers read `list` and must never see archived projects
  // bleed in from the Projects view's "Show archived" mode. Deliberately
  // nested *under* `list` so the existing `invalidateQueries({ queryKey:
  // list })` prefix match refreshes both variants, while the exact-key
  // `setQueryData(list, …)` patches in the mutations still hit only the
  // active list.
  listWithArchived: (wsId: string) =>
    [...projectKeys.list(wsId), "with-archived"] as const,
  detail: (wsId: string, id: string) =>
    [...projectKeys.all(wsId), "detail", id] as const,
};

/**
 * Active projects — archived ones are excluded server-side. Pass
 * `{ includeArchived: true }` only where archived projects are meant to be
 * visible (the Projects view's "Show archived" toggle).
 */
export function projectListOptions(
  wsId: string,
  opts?: { includeArchived?: boolean },
) {
  const includeArchived = opts?.includeArchived === true;
  return queryOptions({
    queryKey: includeArchived
      ? projectKeys.listWithArchived(wsId)
      : projectKeys.list(wsId),
    queryFn: () =>
      api.listProjects(includeArchived ? { include_archived: true } : undefined),
    select: (data) => data.projects,
  });
}

export function projectDetailOptions(wsId: string, id: string) {
  return queryOptions({
    queryKey: projectKeys.detail(wsId, id),
    queryFn: () => api.getProject(id),
  });
}

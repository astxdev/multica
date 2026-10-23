"use client";

import { useCallback } from "react";
import { toast } from "sonner";
import {
  useArchiveProject,
  useRestoreProject,
} from "@multica/core/projects/mutations";
import { useT } from "../../i18n";

export interface UseProjectArchiveActionsResult {
  archiveProject: (id: string) => void;
  restoreProject: (id: string) => void;
}

/**
 * Archive/restore a project with the shared toast contract. Both are
 * reversible and non-destructive (unlike delete), so neither goes through a
 * confirm dialog — they apply straight away and report via toast.
 *
 * Used by the Projects list (row/card menu, batch toolbar) and the project
 * detail header so the three surfaces cannot drift.
 */
export function useProjectArchiveActions(): UseProjectArchiveActionsResult {
  const { t } = useT("projects");
  const archiveMutation = useArchiveProject();
  const restoreMutation = useRestoreProject();

  const archiveProject = useCallback(
    (id: string) => {
      archiveMutation.mutate(id, {
        onSuccess: () => toast.success(t(($) => $.archive.toast_archived)),
        onError: (err) =>
          toast.error(
            err instanceof Error && err.message
              ? err.message
              : t(($) => $.archive.toast_archive_failed),
          ),
      });
    },
    [archiveMutation, t],
  );

  const restoreProject = useCallback(
    (id: string) => {
      restoreMutation.mutate(id, {
        onSuccess: () => toast.success(t(($) => $.archive.toast_restored)),
        onError: (err) =>
          toast.error(
            err instanceof Error && err.message
              ? err.message
              : t(($) => $.archive.toast_restore_failed),
          ),
      });
    },
    [restoreMutation, t],
  );

  return { archiveProject, restoreProject };
}

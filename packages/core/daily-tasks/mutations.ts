import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { dailyTaskKeys } from "./queries";
import type { CreateDailyTaskRequest, DailyTask, ListDailyTasksResponse } from "../types";

export function useCreateDailyTask(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateDailyTaskRequest) => api.createDailyTask(data),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: dailyTaskKeys.list(wsId) });
    },
  });
}

// Toggling done is the canonical optimistic case: same screen, predictable
// outcome, trivial rollback. See CLAUDE.md State Rules.
export function useToggleDailyTask(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, done }: { id: string; done: boolean }) =>
      api.updateDailyTask(id, { done }),
    onMutate: async ({ id, done }) => {
      await qc.cancelQueries({ queryKey: dailyTaskKeys.list(wsId) });
      const prev = qc.getQueryData<ListDailyTasksResponse>(dailyTaskKeys.list(wsId));
      qc.setQueryData<ListDailyTasksResponse>(dailyTaskKeys.list(wsId), (old) =>
        old
          ? {
              ...old,
              tasks: old.tasks.map((task: DailyTask) =>
                task.id === id ? { ...task, done } : task,
              ),
            }
          : old,
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(dailyTaskKeys.list(wsId), ctx.prev);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: dailyTaskKeys.list(wsId) });
    },
  });
}

export function useDeleteDailyTask(wsId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteDailyTask(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: dailyTaskKeys.list(wsId) });
      const prev = qc.getQueryData<ListDailyTasksResponse>(dailyTaskKeys.list(wsId));
      qc.setQueryData<ListDailyTasksResponse>(dailyTaskKeys.list(wsId), (old) =>
        old
          ? {
              ...old,
              tasks: old.tasks.filter((task: DailyTask) => task.id !== id),
              total: old.total - 1,
            }
          : old,
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(dailyTaskKeys.list(wsId), ctx.prev);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: dailyTaskKeys.list(wsId) });
    },
  });
}

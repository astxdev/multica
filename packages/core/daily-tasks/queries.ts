import { queryOptions } from "@tanstack/react-query";
import { api } from "../api";

export const dailyTaskKeys = {
  list: (wsId: string) => ["daily-tasks", wsId, "list"] as const,
};

export function dailyTasksOptions(wsId: string) {
  return queryOptions({
    queryKey: dailyTaskKeys.list(wsId),
    queryFn: () => api.listDailyTasks(),
    select: (data) => data.tasks,
  });
}

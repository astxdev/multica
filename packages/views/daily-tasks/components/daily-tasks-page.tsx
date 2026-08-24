"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  dailyTasksOptions,
  useCreateDailyTask,
  useDeleteDailyTask,
  useToggleDailyTask,
} from "@multica/core/daily-tasks";
import { useWorkspaceId } from "@multica/core/hooks";
import type { DailyTask } from "@multica/core/types";
import { cn } from "@multica/ui/lib/utils";
import { Checkbox } from "@multica/ui/components/ui/checkbox";
import { Input } from "@multica/ui/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@multica/ui/components/ui/tooltip";
import { PageHeader } from "../../layout/page-header";
import { useT } from "../../i18n";

// Personal quick checklist (Google Keep-style), scoped to the current member
// only — see @multica/core/daily-tasks and the server's daily_task table.
export function DailyTasksPage() {
  const { t } = useT("daily-tasks");
  const wsId = useWorkspaceId();
  const [draft, setDraft] = useState("");

  const { data: tasks = [], isLoading } = useQuery(dailyTasksOptions(wsId));
  const createTask = useCreateDailyTask(wsId);
  const toggleTask = useToggleDailyTask(wsId);
  const deleteTask = useDeleteDailyTask(wsId);

  const handleCreate = () => {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    createTask.mutate(
      { text },
      {
        onError: () => {
          toast.error(t(($) => $.error));
          setDraft(text);
        },
      },
    );
  };

  return (
    <div className="flex h-full flex-col">
      <PageHeader>
        <h1 className="text-body font-semibold">{t(($) => $.title)}</h1>
      </PageHeader>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-2xl flex-col gap-0.5 p-4">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreate();
            }}
            className="pb-3"
          >
            <Input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={t(($) => $.add_placeholder)}
              autoFocus
            />
          </form>

          {!isLoading && tasks.length === 0 && (
            <p className="text-caption text-muted-foreground px-1 py-6 text-center">
              {t(($) => $.empty)}
            </p>
          )}

          {tasks.map((task: DailyTask) => (
            <div
              key={task.id}
              className="group/row flex items-center gap-3 rounded-md px-2 py-1.5 hover:bg-sidebar-accent/50"
            >
              <Checkbox
                checked={task.done}
                onCheckedChange={(checked) => {
                  const done = checked === true;
                  toggleTask.mutate(
                    { id: task.id, done },
                    { onError: () => toast.error(t(($) => $.error)) },
                  );
                }}
              />
              <span
                className={cn(
                  "min-w-0 flex-1 truncate text-body",
                  task.done && "text-muted-foreground line-through",
                )}
              >
                {task.text}
              </span>
              <Tooltip>
                <TooltipTrigger
                  render={<button type="button" />}
                  className="hidden size-6 shrink-0 items-center justify-center rounded-sm text-muted-foreground group-hover/row:flex hover:bg-sidebar-accent hover:text-foreground"
                  onClick={() => {
                    deleteTask.mutate(task.id, {
                      onError: () => toast.error(t(($) => $.error)),
                    });
                  }}
                >
                  <Trash2 className="size-3.5" />
                </TooltipTrigger>
                <TooltipContent side="top">{t(($) => $.delete_tooltip)}</TooltipContent>
              </Tooltip>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

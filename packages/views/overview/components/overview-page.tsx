"use client";

import { useMemo } from "react";
import { LayoutGrid } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@multica/ui/components/ui/table";
import { Skeleton } from "@multica/ui/components/ui/skeleton";
import { CurrencyNumberFlow } from "@multica/ui/components/ui/number-flow";
import { useWorkspaceId } from "@multica/core/hooks";
import { useWorkspacePaths } from "@multica/core/paths";
import { projectListOptions } from "@multica/core/projects/queries";
import {
  PROJECT_STATUS_CONFIG,
  PROJECT_STATUS_ORDER,
} from "@multica/core/projects/config";
import {
  dashboardUsageByProjectOptions,
  dashboardRunTimeByProjectOptions,
  dashboardOverdueIssuesOptions,
} from "@multica/core/dashboard";
import type {
  Project,
  DashboardUsageByProject,
  DashboardProjectRunTime,
  DashboardOverdueIssue,
} from "@multica/core/types";
import { PageHeader } from "../../layout/page-header";
import { useViewingTimezone } from "../../common/use-viewing-timezone";
import { AppLink } from "../../navigation";
import { estimateCost, formatTokens, todayIso } from "../../runtimes/utils";
import { useProjectStatusLabels } from "../../projects/components/labels";
import { useT } from "../../i18n";

const EMPTY_PROJECTS: Project[] = [];
const EMPTY_USAGE: DashboardUsageByProject[] = [];
const EMPTY_RUNTIME: DashboardProjectRunTime[] = [];
const EMPTY_OVERDUE: DashboardOverdueIssue[] = [];

// Fixed 30-day window, same default as the /usage dashboard. This page has
// no range picker (unlike /usage) — it is a fleet-wide status board, not a
// trend-analysis surface, so one steady window keeps every card comparable.
const DAYS = 30;

function formatHours(seconds: number): string {
  return `${(seconds / 3600).toFixed(1)}h`;
}

/**
 * Workspace overview — a members-facing status board answering three
 * questions at a glance: how are projects tracking (status mix), what are
 * they costing in agent time/tokens/$, and what is overdue right now.
 *
 * Lives at `/{slug}/overview`. Same read-only, workspace-membership-only
 * access as `/usage` (see server/internal/handler/dashboard.go) — every
 * row here is already visible piecemeal on the Projects and Usage pages;
 * this just aggregates them onto one page.
 */
export function OverviewPage() {
  const { t, i18n } = useT("overview");
  const wsId = useWorkspaceId();
  const viewTZ = useViewingTimezone();
  const wsPaths = useWorkspacePaths();
  const statusLabels = useProjectStatusLabels();
  const locales = i18n.resolvedLanguage ?? i18n.language;

  const projectsQuery = useQuery(projectListOptions(wsId));
  const projects = projectsQuery.data ?? EMPTY_PROJECTS;

  const usageQuery = useQuery(dashboardUsageByProjectOptions(wsId, DAYS, viewTZ));
  const runtimeQuery = useQuery(dashboardRunTimeByProjectOptions(wsId, DAYS, viewTZ));
  const overdueQuery = useQuery(dashboardOverdueIssuesOptions(wsId));

  const usageRows = usageQuery.data ?? EMPTY_USAGE;
  const runtimeRows = runtimeQuery.data ?? EMPTY_RUNTIME;
  const overdueRows = overdueQuery.data ?? EMPTY_OVERDUE;

  const statusCounts = useMemo(() => {
    const counts = new Map<Project["status"], number>(
      PROJECT_STATUS_ORDER.map((s) => [s, 0]),
    );
    for (const p of projects) counts.set(p.status, (counts.get(p.status) ?? 0) + 1);
    return counts;
  }, [projects]);

  // Merge the two by-project rollups (token/cost, run-time) keyed on
  // project_id, then attach the project title. Rows the workspace no longer
  // has a project record for (deleted project, usage rolled up before the
  // delete) are dropped — there's no title to show and no page to link to.
  const projectUsage = useMemo(() => {
    type Stats = { cost: number; tokens: number; seconds: number; tasks: number };
    const byId = new Map<string, Stats>();
    const bump = (id: string, patch: Partial<Stats>) => {
      const entry = byId.get(id) ?? { cost: 0, tokens: 0, seconds: 0, tasks: 0 };
      byId.set(id, {
        cost: entry.cost + (patch.cost ?? 0),
        tokens: entry.tokens + (patch.tokens ?? 0),
        seconds: entry.seconds + (patch.seconds ?? 0),
        tasks: entry.tasks + (patch.tasks ?? 0),
      });
    };
    for (const row of usageRows) {
      bump(row.project_id, {
        cost: estimateCost(row),
        tokens:
          row.input_tokens +
          row.output_tokens +
          row.cache_read_tokens +
          row.cache_write_tokens,
      });
    }
    for (const row of runtimeRows) {
      bump(row.project_id, { seconds: row.total_seconds, tasks: row.task_count });
    }
    const titleOf = new Map(projects.map((p) => [p.id, p.title]));
    return Array.from(byId.entries())
      .filter(([id]) => titleOf.has(id))
      .map(([id, stats]) => ({ projectId: id, title: titleOf.get(id) ?? id, ...stats }))
      .sort((a, b) => b.cost - a.cost);
  }, [usageRows, runtimeRows, projects]);

  const today = useMemo(() => todayIso(viewTZ), [viewTZ]);
  const daysOverdue = (dueDate: string): number => {
    const due = new Date(`${dueDate}T00:00:00Z`).getTime();
    const now = new Date(`${today}T00:00:00Z`).getTime();
    return Math.max(1, Math.round((now - due) / 86_400_000));
  };

  const totalProjects = projects.length;
  const projectsLoading = projectsQuery.isLoading;
  const usageLoading = usageQuery.isLoading || runtimeQuery.isLoading;
  const overdueLoading = overdueQuery.isLoading;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PageHeader className="gap-2 px-5">
        <LayoutGrid className="h-4 w-4 shrink-0 text-muted-foreground" />
        <h1 className="text-body font-medium">{t(($) => $.title)}</h1>
      </PageHeader>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl space-y-5 p-6">
          {/* Projects by status */}
          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-label font-medium">{t(($) => $.status.title)}</h2>
            {projectsLoading ? (
              <Skeleton className="mt-3 h-8 rounded" />
            ) : totalProjects === 0 ? (
              <p className="mt-2 text-caption text-muted-foreground">
                {t(($) => $.status.no_data)}
              </p>
            ) : (
              <>
                <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-muted">
                  {PROJECT_STATUS_ORDER.map((status) => {
                    const count = statusCounts.get(status) ?? 0;
                    if (count === 0) return null;
                    const pct = (count / totalProjects) * 100;
                    return (
                      <div
                        key={status}
                        className={PROJECT_STATUS_CONFIG[status].dotColor}
                        style={{ width: `${pct}%` }}
                      />
                    );
                  })}
                </div>
                <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
                  {PROJECT_STATUS_ORDER.map((status) => {
                    const count = statusCounts.get(status) ?? 0;
                    const pct = totalProjects > 0 ? Math.round((count / totalProjects) * 100) : 0;
                    return (
                      <div key={status} className="flex items-center gap-1.5 text-caption">
                        <span
                          className={`size-2 rounded-full ${PROJECT_STATUS_CONFIG[status].dotColor}`}
                        />
                        <span className="text-foreground">{statusLabels[status]}</span>
                        <span className="tabular-nums text-muted-foreground">
                          {count} · {pct}%
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </section>

          {/* Usage by project */}
          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-label font-medium">
              {t(($) => $.usage.title, { days: DAYS })}
            </h2>
            {usageLoading ? (
              <Skeleton className="mt-3 h-32 rounded" />
            ) : projectUsage.length === 0 ? (
              <p className="mt-2 text-caption text-muted-foreground">
                {t(($) => $.usage.no_data)}
              </p>
            ) : (
              <Table className="mt-3">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t(($) => $.usage.header_project)}</TableHead>
                    <TableHead className="text-right">
                      {t(($) => $.usage.header_hours)}
                    </TableHead>
                    <TableHead className="text-right">
                      {t(($) => $.usage.header_tasks)}
                    </TableHead>
                    <TableHead className="text-right">
                      {t(($) => $.usage.header_tokens)}
                    </TableHead>
                    <TableHead className="text-right">
                      {t(($) => $.usage.header_cost)}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {projectUsage.map((row) => (
                    <TableRow key={row.projectId}>
                      <TableCell>
                        <AppLink
                          href={wsPaths.projectDetail(row.projectId)}
                          className="font-medium hover:underline"
                        >
                          {row.title}
                        </AppLink>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatHours(row.seconds)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{row.tasks}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTokens(row.tokens)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        <CurrencyNumberFlow value={row.cost} locales={locales} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>

          {/* Overdue tasks */}
          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-label font-medium">
              {t(($) => $.overdue.title)}{" "}
              <span className="font-normal text-muted-foreground">
                {t(($) => $.overdue.count_label, { count: overdueRows.length })}
              </span>
            </h2>
            {overdueLoading ? (
              <Skeleton className="mt-3 h-32 rounded" />
            ) : overdueRows.length === 0 ? (
              <p className="mt-2 text-caption text-muted-foreground">
                {t(($) => $.overdue.no_data)}
              </p>
            ) : (
              <Table className="mt-3">
                <TableHeader>
                  <TableRow>
                    <TableHead>{t(($) => $.overdue.header_task)}</TableHead>
                    <TableHead>{t(($) => $.overdue.header_project)}</TableHead>
                    <TableHead className="text-right">
                      {t(($) => $.overdue.header_due)}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {overdueRows.map((issue) => (
                    <TableRow key={issue.id}>
                      <TableCell>
                        <AppLink
                          href={wsPaths.issueDetail(issue.id)}
                          className="font-medium hover:underline"
                        >
                          {issue.title}
                        </AppLink>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {issue.project_id ? (
                          <AppLink
                            href={wsPaths.projectDetail(issue.project_id)}
                            className="hover:underline"
                          >
                            {issue.project_title}
                          </AppLink>
                        ) : (
                          t(($) => $.overdue.no_project)
                        )}
                      </TableCell>
                      <TableCell className="text-right text-destructive tabular-nums">
                        {t(($) => $.overdue.days_overdue, {
                          count: daysOverdue(issue.due_date),
                        })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useMemo } from "react";
import { EyeOff, LayoutGrid, Trash2 } from "lucide-react";
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
import { agentListOptions } from "@multica/core/workspace/queries";
import {
  PROJECT_STATUS_CONFIG,
  PROJECT_STATUS_ORDER,
} from "@multica/core/projects/config";
import {
  dashboardUsageByProjectOptions,
  dashboardRunTimeByProjectOptions,
  dashboardOverdueIssuesOptions,
  dashboardUsageByAgentOptions,
} from "@multica/core/dashboard";
import type {
  Agent,
  Project,
  DashboardUsageByProject,
  DashboardProjectRunTime,
  DashboardOverdueIssue,
  DashboardUsageByAgent,
} from "@multica/core/types";
import { PageHeader } from "../../layout/page-header";
import { useViewingTimezone } from "../../common/use-viewing-timezone";
import { ActorAvatar } from "../../common/actor-avatar";
import { AppLink } from "../../navigation";
import { estimateCost, formatTokens, todayIso } from "../../runtimes/utils";
import {
  aggregateAgentTokens,
  aggregateUsageByModel,
  bucketUnknownAgentRows,
  DELETED_AGENTS_ROW_ID,
  RESTRICTED_AGENTS_ROW_ID,
} from "../../dashboard/utils";
import { useProjectStatusLabels } from "../../projects/components/labels";
import { useT } from "../../i18n";

const EMPTY_PROJECTS: Project[] = [];
const EMPTY_USAGE: DashboardUsageByProject[] = [];
const EMPTY_RUNTIME: DashboardProjectRunTime[] = [];
const EMPTY_OVERDUE: DashboardOverdueIssue[] = [];
const EMPTY_BY_AGENT: DashboardUsageByAgent[] = [];
const EMPTY_AGENTS: Agent[] = [];

// Fixed 30-day window, same default as the /usage dashboard. This page has
// no range picker (unlike /usage) — it is a fleet-wide status board, not a
// trend-analysis surface, so one steady window keeps every card comparable.
const DAYS = 30;

// How many rows each ranked card shows before truncating. This page is a
// glance board, not a deep-dive surface (that's /usage, linked from the
// agents card) — no sort toggle, no "show all", just the heaviest hitters.
const AGENTS_LIMIT = 8;
const MODELS_LIMIT = 5;

// Sentinel folding every model past MODELS_LIMIT into one legend row, mirrors
// the deleted/restricted agent sentinels below — never a real model id, so it
// can't collide with one.
const OTHER_MODEL_KEY = "__other_models__";

// Cycled by rank, one per visible model slot; the "Other" bucket gets a
// neutral tone instead of wrapping back to chart-1, which would make it look
// like a real (repeated) model.
const MODEL_COLORS = ["bg-chart-1", "bg-chart-2", "bg-chart-3", "bg-chart-4", "bg-chart-5"];
const OTHER_MODEL_COLOR = "bg-muted-foreground/40";

interface ModelUsageRow {
  key: string;
  tokens: number;
  cost: number;
  pct: number;
  color: string;
}

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
  const agentsQuery = useQuery(agentListOptions(wsId));
  // Per-(agent, model) rollup — the single source for both the "agents by
  // usage" and "usage by model" cards below; the model dimension is already
  // on every row, so no second request is needed to slice it that way.
  const byAgentQuery = useQuery(dashboardUsageByAgentOptions(wsId, DAYS, null, viewTZ));

  const usageRows = usageQuery.data ?? EMPTY_USAGE;
  const runtimeRows = runtimeQuery.data ?? EMPTY_RUNTIME;
  const overdueRows = overdueQuery.data ?? EMPTY_OVERDUE;
  const agents = agentsQuery.data ?? EMPTY_AGENTS;
  const byAgentUsage = byAgentQuery.data ?? EMPTY_BY_AGENT;

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

  // Which agent ids this viewer can actually resolve to a name — drives
  // whether a hard-deleted agent's rollup rows fold into the neutral
  // "Deleted agents" bucket instead of rendering a bare UUID. `null` while
  // the agent list is still loading, so bucketing is skipped until it's
  // known which ids are real (see bucketUnknownAgentRows).
  const knownAgentIds = useMemo(
    () => (agentsQuery.isSuccess ? new Set(agents.map((a) => a.id)) : null),
    [agentsQuery.isSuccess, agents],
  );

  // Top spenders across the window, cost desc. `bucketUnknownAgentRows`
  // expects the merged agent+run-time row shape; this card doesn't fetch
  // run-time, so every row carries seconds: 0 (unused here — cost/tokens
  // only, per its own columns).
  const topAgents = useMemo(() => {
    const tokenRows = aggregateAgentTokens(byAgentUsage).map((r) => ({
      ...r,
      seconds: 0,
    }));
    const bucketed = bucketUnknownAgentRows(tokenRows, knownAgentIds);
    return bucketed.toSorted((a, b) => b.cost - a.cost).slice(0, AGENTS_LIMIT);
  }, [byAgentUsage, knownAgentIds]);

  const maxAgentCost = useMemo(
    () => topAgents.reduce((m, r) => Math.max(m, r.cost), 0),
    [topAgents],
  );

  // % of usage (by tokens) and cost per model, top MODELS_LIMIT plus one
  // "Other" row folding the remainder — mirrors the agent bucket above, just
  // capped by rank instead of by identity.
  const modelUsage = useMemo<ModelUsageRow[]>(() => {
    const rows = aggregateUsageByModel(byAgentUsage);
    const totalTokens = rows.reduce((sum, r) => sum + r.tokens, 0);
    const top = rows.slice(0, MODELS_LIMIT);
    const rest = rows.slice(MODELS_LIMIT);
    const restTokens = rest.reduce((sum, r) => sum + r.tokens, 0);
    const restCost = rest.reduce((sum, r) => sum + r.cost, 0);
    const withPct = (key: string, tokens: number, cost: number, color: string) => ({
      key,
      tokens,
      cost,
      pct: totalTokens > 0 ? (tokens / totalTokens) * 100 : 0,
      color,
    });
    const result = top.map((r, i) => withPct(r.key, r.tokens, r.cost, MODEL_COLORS[i]!));
    if (restTokens > 0) {
      result.push(withPct(OTHER_MODEL_KEY, restTokens, restCost, OTHER_MODEL_COLOR));
    }
    return result;
  }, [byAgentUsage]);

  const agentsSectionLoading = agentsQuery.isLoading || byAgentQuery.isLoading;
  const modelsSectionLoading = byAgentQuery.isLoading;

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

          {/* Agents by usage */}
          <section className="rounded-lg border bg-card p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-label font-medium">
                {t(($) => $.agents.title, { days: DAYS })}
              </h2>
              <AppLink
                href={wsPaths.usage()}
                className="text-caption text-muted-foreground hover:text-foreground hover:underline"
              >
                {t(($) => $.agents.view_all)}
              </AppLink>
            </div>
            {agentsSectionLoading ? (
              <Skeleton className="mt-3 h-32 rounded" />
            ) : topAgents.length === 0 ? (
              <p className="mt-2 text-caption text-muted-foreground">
                {t(($) => $.agents.no_data)}
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {topAgents.map((row) => {
                  const isDeletedBucket = row.agentId === DELETED_AGENTS_ROW_ID;
                  const isRestrictedBucket = row.agentId === RESTRICTED_AGENTS_ROW_ID;
                  const isBucket = isDeletedBucket || isRestrictedBucket;
                  const agent = agents.find((a) => a.id === row.agentId);
                  const pct = maxAgentCost > 0 ? (row.cost / maxAgentCost) * 100 : 0;
                  return (
                    <div
                      key={row.agentId}
                      className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_5rem_5rem] items-center gap-3"
                    >
                      <div className="flex min-w-0 items-center gap-2">
                        {isBucket ? (
                          <>
                            <span className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                              {isDeletedBucket ? (
                                <Trash2 className="h-3 w-3" />
                              ) : (
                                <EyeOff className="h-3 w-3" />
                              )}
                            </span>
                            <span className="truncate text-body font-medium italic text-muted-foreground">
                              {isDeletedBucket
                                ? t(($) => $.agents.deleted_agents)
                                : t(($) => $.agents.other_agents)}
                            </span>
                          </>
                        ) : (
                          <>
                            <ActorAvatar
                              actorType="agent"
                              actorId={row.agentId}
                              size="sm"
                              enableHoverCard
                            />
                            <span className="cursor-pointer truncate text-body font-medium">
                              {agent?.name ?? row.agentId}
                            </span>
                          </>
                        )}
                      </div>
                      <div className="relative h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-chart-1"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="text-right text-caption tabular-nums text-muted-foreground">
                        {formatTokens(row.tokens)}
                      </div>
                      <div className="text-right text-body font-medium tabular-nums">
                        <CurrencyNumberFlow value={row.cost} locales={locales} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Usage by model */}
          <section className="rounded-lg border bg-card p-5">
            <h2 className="text-label font-medium">
              {t(($) => $.models.title, { days: DAYS })}
            </h2>
            {modelsSectionLoading ? (
              <Skeleton className="mt-3 h-8 rounded" />
            ) : modelUsage.length === 0 ? (
              <p className="mt-2 text-caption text-muted-foreground">
                {t(($) => $.models.no_data)}
              </p>
            ) : (
              <>
                <div className="mt-3 flex h-2 w-full overflow-hidden rounded-full bg-muted">
                  {modelUsage.map((row) => (
                    <div
                      key={row.key}
                      className={row.color}
                      style={{ width: `${row.pct}%` }}
                    />
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  {modelUsage.map((row) => (
                    <div
                      key={row.key}
                      className="flex items-center justify-between gap-3 text-caption"
                    >
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className={`size-2 shrink-0 rounded-full ${row.color}`} />
                        <span className="truncate font-mono text-foreground">
                          {row.key === OTHER_MODEL_KEY
                            ? t(($) => $.models.other)
                            : row.key}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 tabular-nums text-muted-foreground">
                        <span>{Math.round(row.pct)}%</span>
                        <span className="text-foreground">
                          <CurrencyNumberFlow value={row.cost} locales={locales} />
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
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

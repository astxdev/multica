# feat(daily-tasks): adicionar checklist pessoal "Daily Tasks"

**Data**: 24/08/2026
**Branch**: main

## O que foi alterado
Nova área "Daily Tasks" no workspace (aba acima de "Overview" na sidebar), um checklist rápido no estilo Google Keep: adicionar item de texto, marcar/desmarcar com checkbox (texto risca quando concluído), apagar item. É pessoal — cada membro vê e edita só as próprias tasks, mesmo dentro do mesmo workspace; itens concluídos ficam visíveis riscados até serem apagados manualmente.

Backend:
- Tabela `daily_task` (`workspace_id`, `user_id`, `text`, `done`, `created_at`, `updated_at`), sem FK (regra do repo). Migrações `302_daily_task` (tabela) e `303_daily_task_workspace_user_index` (índice concorrente em `(workspace_id, user_id, created_at)`).
- Queries sqlc em `server/pkg/db/queries/daily_task.sql` (List/Get/Create/SetDone/Delete).
- Handler `server/internal/handler/daily_task.go`: `ListDailyTasks`, `CreateDailyTask`, `ToggleDailyTask`, `DeleteDailyTask`, todos escopados por workspace + usuário autenticado (`GetDailyTaskForUser` filtra por `id + workspace_id + user_id`, então uma task de outro membro simplesmente 404). Sem publish de evento realtime — lista pessoal de um único usuário, invalidação padrão do TanStack Query após cada mutação já mantém a UI consistente.
- Rotas em `/api/daily-tasks` (`GET`, `POST`, `PATCH /{id}`, `DELETE /{id}`), dentro do grupo já protegido por `RequireWorkspaceMember`.

Frontend (compartilhado web/desktop):
- Tipos, schema zod (`DailyTaskSchema`/`ListDailyTasksResponseSchema`) e métodos de API client (`listDailyTasks`, `createDailyTask`, `updateDailyTask`, `deleteDailyTask`).
- `packages/core/daily-tasks`: `dailyTasksOptions` (query) e `useCreateDailyTask`/`useToggleDailyTask`/`useDeleteDailyTask` (mutations — toggle e delete são otimistas, seguindo as State Rules do projeto).
- `packages/views/daily-tasks`: página `DailyTasksPage` (input de criação, lista com checkbox + strikethrough, apagar no hover).
- Nova entrada de navegação: `paths.workspace(slug).dailyTasks()`, ícone `ListChecks` em `route-icons.ts`/`route-icon-components.tsx`, entrada em `workspaceNav` (app-sidebar) posicionada acima de "overview".
- Traduções em en/ja/ko/zh-Hans (`layout.json` → `nav.daily_tasks`, novo namespace `daily-tasks.json`).
- Wiring: `apps/web/app/[workspaceSlug]/(dashboard)/daily-tasks/page.tsx` e rota no router do desktop.

## Por que foi alterado
Pedido do usuário: uma área rápida para organizar a agenda do dia, tipo Google Keep — criar lista, marcar item com checkbox, riscar quando feito.

## Arquivos modificados
- `server/migrations/302_daily_task.{up,down}.sql`, `303_daily_task_workspace_user_index.{up,down}.sql`
- `server/pkg/db/queries/daily_task.sql`, `server/pkg/db/generated/daily_task.sql.go`, `server/pkg/db/generated/models.go`
- `server/internal/handler/daily_task.go`, `server/internal/handler/daily_task_test.go`
- `server/cmd/server/router.go`
- `packages/core/types/daily-task.ts`, `packages/core/types/index.ts`
- `packages/core/api/schemas.ts`, `packages/core/api/client.ts`
- `packages/core/daily-tasks/{index,queries,mutations}.ts`, `packages/core/package.json`
- `packages/core/paths/paths.ts`, `packages/core/paths/route-icons.ts`
- `packages/core/diagnostics/diagnostic-context.ts` — nova rota registrada no bucketing de diagnóstico (senão cai na máscara `*`)
- `packages/views/daily-tasks/{index,components/daily-tasks-page}.tsx`, `packages/views/package.json`
- `packages/views/layout/app-sidebar.tsx`, `packages/views/layout/route-icon-components.tsx`
- `packages/views/i18n/resources-types.ts`, `packages/views/locales/index.ts`
- `packages/views/locales/{en,ja,ko,zh-Hans}/layout.json`, `packages/views/locales/{en,ja,ko,zh-Hans}/daily-tasks.json`
- `apps/web/app/[workspaceSlug]/(dashboard)/daily-tasks/page.tsx`
- `apps/desktop/src/renderer/src/routes.tsx`

## Como testar
1. Abrir um workspace, confirmar que "Daily Tasks" aparece na sidebar acima de "Overview".
2. Adicionar um item de texto, marcar o checkbox (texto risca), desmarcar (volta ao normal), apagar.
3. Confirmar com um segundo usuário no mesmo workspace que a lista dele é independente (não vê os itens do primeiro).
4. `pnpm typecheck`, `pnpm lint` e `pnpm test` rodados e passando. Testes Go do novo handler (`daily_task_test.go`, incluindo isolamento por usuário) **não puderam ser executados neste ambiente** por falta de Postgres/Docker local — recomenda-se rodar `make test` (ou `go test ./internal/handler/... -run TestDailyTask`) antes do deploy. Também não houve teste manual em navegador (sem servidor local rodando neste ambiente).

## Impacto
- [ ] Quebra compatibilidade com algo existente? Não — endpoint e tabela novos, aditivos.
- [x] Requer migration de banco? Sim — `302_daily_task` e `303_daily_task_workspace_user_index`.
- [ ] Requer variável de ambiente nova? Não.
- [ ] Requer comunicar o time? Não.

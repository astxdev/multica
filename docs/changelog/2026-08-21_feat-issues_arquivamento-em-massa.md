# feat(issues): adicionar arquivamento de issues em massa

**Data**: 21/08/2026
**Branch**: main

## O que foi alterado
Novo fluxo de "archive em massa" na lista de issues: com múltiplas issues selecionadas (checkboxes na table view / list view, já existentes), a toolbar de ações em lote ganhou um botão "Archive" que arquiva todas as issues selecionadas de uma vez, aplicando direto (sem dialog de confirmação, igual ao archive individual — é uma ação reversível).

Backend:
- Novo endpoint `POST /api/issues/batch-archive`, seguindo o mesmo padrão de `batch-update`/`batch-delete`: recebe `{issue_ids}`, itera cada ID (pula UUID inválido, issue não encontrada no workspace, ou já arquivada), arquiva via a query `ArchiveIssue` já existente e publica `issue:updated` por issue. Retorna `{"archived": N}`.

Frontend (compartilhado web/desktop):
- `batchArchiveIssues` no client de API, `useBatchArchiveIssues()` no core (mesma estratégia sem optimistic update do `useArchiveIssue`, já que archive é só um toggle de visibilidade — invalida `issueKeys.list`/`issueKeys.tableAll` no `onSuccess`).
- `batchArchive` adicionado à interface `IssueSurfaceActions` e implementado em `useIssueSurfaceActions`.
- Botão "Archive" na `BatchActionToolbar`, entre os pickers e o botão "Delete".
- Traduções em en/zh-Hans/ja/ko.

Não foi adicionado "restore em massa" — fora do escopo pedido; pode ser adicionado depois seguindo o mesmo padrão.

## Por que foi alterado
Pedido do usuário: selecionar várias issues e arquivá-las de uma vez, em vez de arquivar uma por uma pelo menu de contexto.

## Arquivos modificados
- `server/internal/handler/issue.go` — handler `BatchArchiveIssues`.
- `server/cmd/server/router.go` — rota `POST /api/issues/batch-archive`.
- `server/internal/handler/issue_archive_test.go` — testes `TestBatchArchiveIssues` e `TestBatchArchiveIssuesEmptyIDsRejected`.
- `packages/core/api/client.ts` — `batchArchiveIssues`.
- `packages/core/issues/mutations.ts` — `useBatchArchiveIssues`.
- `packages/core/issues/mutations.test.tsx` — teste da nova mutation.
- `packages/views/issues/surface/actions-context.tsx` e `use-issue-surface-actions.ts` — `batchArchive` na interface de ações de surface.
- `packages/views/issues/components/batch-action-toolbar.tsx` — botão "Archive" e handler.
- `packages/views/issues/components/batch-action-toolbar.test.tsx` — testes do botão Archive (sucesso e erro).
- `packages/views/issues/components/board-card-assignee-picker.test.tsx` — mock de `IssueSurfaceActions` atualizado com `batchArchive`.
- `packages/views/locales/{en,zh-Hans,ja,ko}/issues.json` — chaves `batch.archive*`.

## Como testar
1. Na lista de issues, selecionar 2+ issues (checkbox na table view ou list view).
2. Na toolbar "N selected" que aparece, clicar em "Archive".
3. Confirmar que as issues somem da view padrão (que exclui arquivadas) e que "Show archived" no filtro as traz de volta.
4. `pnpm typecheck`, `pnpm lint` e `pnpm test` rodados e passando (ver seção Impacto). Testes de backend (`go test ./internal/handler/...`) não puderam ser executados neste ambiente por falta de Postgres/Docker local — recomenda-se rodar `make test` antes do deploy.

## Impacto
- [ ] Quebra compatibilidade com algo existente? Não — endpoint novo, aditivo.
- [ ] Requer migration de banco? Não — reaproveita as colunas `archived_at`/`archived_by` e a query `ArchiveIssue` já existentes.
- [ ] Requer variável de ambiente nova? Não.
- [ ] Requer comunicar o time? Não.

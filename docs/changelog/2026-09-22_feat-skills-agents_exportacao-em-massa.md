# feat(skills,agents): adicionar exportação em massa (zip) de skills e agentes

**Data**: 22/09/2026
**Branch**: main

## O que foi alterado
Novo botão "Export" na toolbar de seleção em lote de skills (`/{ws}/skills`) e de agentes (`/{ws}/agents`, que já tinha seleção múltipla via `AgentBatchToolbar`). Ao selecionar itens e clicar em "Export", o navegador baixa um `.zip` com uma pasta por item selecionado.

Backend:
- `POST /api/skills/export` (`{skill_ids}`): monta um zip com uma pasta por skill (nome sanitizado, com sufixo numérico em caso de colisão), contendo `SKILL.md` (conteúdo bruto, já com frontmatter) mais qualquer `skill_file` (arquivo de referência/subpasta) no path original — mesmo layout que `parseSkillArchive` (import) já aceita, então dá para reimportar o zip exportado. IDs inválidos, inexistentes ou de outro workspace são pulados silenciosamente (mesma tolerância do `batch-archive` de issues). Exporta só skills customizados do workspace (skills built-in, embutidos no binário, ficam de fora).
- `POST /api/agents/export` (`{agent_ids}`): mesmo padrão, uma pasta por agente com `INSTRUCTIONS.md` contendo só as instruções escritas pelo dono (`agent.instructions`) — nunca o `system_instructions` de agentes de sistema como a Mika, que é product-owned e não deve sair do binário. Agentes privados que o requisitante não pode acessar (mesmo gate de `GetAgent`) são pulados.
- Ambas as rotas ficam dentro dos grupos já protegidos por `RequireWorkspaceMember`.

Frontend (compartilhado web/desktop):
- `api.exportSkills(ids)` / `api.exportAgents(ids)` no client de API, via `fetchRaw` + `.blob()` (mesmo padrão de `getAttachmentBlob`) — não passam pelo `fetch<T>` porque a resposta é um arquivo binário, não JSON.
- Botão "Export" em `SkillBatchToolbar` (`packages/views/skills/components/skill-list-actions.tsx`) e em `AgentBatchToolbar` (`packages/views/agents/components/agent-batch-toolbar.tsx`), com estado de loading e download via `URL.createObjectURL` + `<a download>` (mesmo idioma do export CSV da tabela de issues). Sem mutation de react-query — é um download avulso, não estado de servidor cacheado.
- Traduções em en/zh-Hans/ja/ko.

Não foi adicionada exportação de skill/agente individual pelo menu de contexto (kebab) — fora do escopo pedido (só seleção em massa); pode ser adicionado depois reaproveitando os mesmos endpoints.

## Por que foi alterado
Pedido do usuário: poder selecionar vários skills (ou agentes) na listagem e exportar tudo de uma vez em um único zip, organizado em pastas, para backup/portabilidade — em vez de exportar um por um.

## Arquivos modificados
- `server/internal/handler/skill_export_archive.go` — handler `ExportSkills` + helpers de zip (`uniqueArchiveFolderName`, `sanitizeArchiveEntryName`, `writeZipTextEntry`, `writeZipResponse`).
- `server/internal/handler/agent_export_archive.go` — handler `ExportAgents`.
- `server/internal/handler/skill_export_archive_test.go` — testes unitários dos helpers puros de zip (não dependem de banco).
- `server/cmd/server/router.go` — rotas `POST /api/skills/export` e `POST /api/agents/export`.
- `packages/core/api/client.ts` — `exportSkills`, `exportAgents`.
- `packages/views/skills/components/skill-list-actions.tsx` — botão "Export" na `SkillBatchToolbar`.
- `packages/views/agents/components/agent-batch-toolbar.tsx` — botão "Export" na `AgentBatchToolbar`.
- `packages/views/locales/{en,zh-Hans,ja,ko}/skills.json` — chaves `actions.export*`.
- `packages/views/locales/{en,zh-Hans,ja,ko}/agents.json` — chaves `row_actions.export*`.

## Como testar
1. Em `/{workspace}/skills`, selecionar 2+ skills customizados (checkbox) e clicar em "Export" na toolbar flutuante; confirmar que baixa um `.zip` com uma pasta por skill (`SKILL.md` + arquivos de referência, se houver).
2. Em `/{workspace}/agents`, selecionar 2+ agentes e clicar em "Export"; confirmar que baixa um `.zip` com uma pasta por agente contendo `INSTRUCTIONS.md`.
3. `pnpm typecheck` rodado e passando nos 8 pacotes do monorepo. `go build ./...` e `go vet ./...` do backend passando.
4. Testes de backend com banco (`go test ./internal/handler/...`) não puderam ser executados neste ambiente — o Postgres local não é o banco de dev do multica (role `multica` inexistente). Recomenda-se rodar `make test` num ambiente com o banco de dev antes do deploy, se possível.

## Impacto
- [ ] Quebra compatibilidade com algo existente? Não — endpoints novos, aditivos.
- [ ] Requer migration de banco? Não — só leitura de `skill`, `skill_file` e `agent` já existentes.
- [ ] Requer variável de ambiente nova? Não.
- [ ] Requer comunicar o time? Não.

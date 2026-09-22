# fix(skills): incluir description no SKILL.md/INSTRUCTIONS.md exportado

**Data**: 22/09/2026
**Branch**: main

## O que foi alterado
`ExportSkills` agora monta o conteúdo escrito em `SKILL.md`/`INSTRUCTIONS.md` a partir de uma nova função `skillMarkdownForExport(name, description, content)`, em vez de escrever `skill.Content` cru:

- Se `skill.Content` já começa com um bloco de frontmatter YAML (`---`) — caso dos skills importados de arquivo/URL — o conteúdo é exportado sem alteração, preservando qualquer campo extra que já exista ali (`license`, `allowed-tools`, etc.).
- Se `skill.Content` não tem frontmatter — caso dos skills criados pelo formulário manual "New skill", onde `content` é só o corpo em texto livre e `description` mora apenas na coluna separada do banco — um bloco de frontmatter é gerado com `name` e `description` (quando não vazio) e prefixado ao corpo, usando aspas duplas com escape YAML para não quebrar com `:`, aspas ou quebras de linha no texto.

## Por que foi alterado
Segue o fix anterior (`2026-09-22_fix-skills_exportar-instructions-md.md`). O usuário apontou que o problema real era o campo "Description": para skills criados manualmente, esse campo nunca aparecia no arquivo exportado porque ele vive só na coluna `description` do banco, nunca dentro de `skill.content`.

## Arquivos modificados
- `server/internal/handler/skill_export_archive.go` — nova `skillMarkdownForExport` + `yamlDoubleQuoted`; `ExportSkills` passa a escrever esse markdown (em vez de `skill.Content` cru) tanto em `SKILL.md` quanto em `INSTRUCTIONS.md`.
- `server/internal/handler/skill_export_archive_test.go` — testes unitários de `skillMarkdownForExport` (sem frontmatter/com frontmatter existente/description vazia/caracteres especiais).

## Como testar
1. Criar um skill pelo formulário manual ("New skill" → "Manual"), preenchendo Nome e Description, sem editar o conteúdo depois.
2. Selecionar esse skill em `/{workspace}/skills` e clicar em "Export".
3. Abrir o `.zip`: `SKILL.md` e `INSTRUCTIONS.md` devem começar com um frontmatter `---\nname: "..."\ndescription: "..."\n---` seguido do corpo.
4. Para um skill importado de URL/arquivo (que já tem frontmatter próprio), confirmar que o frontmatter exportado é o original, sem duplicação.
5. `go build ./...`, `gofmt -l` e `go vet ./internal/handler/...` passando. `go test ./internal/handler/...` não pôde rodar neste ambiente — o Postgres local não tem a role `multica` (mesma limitação já registrada no changelog anterior), então o `TestMain` do pacote pula todos os testes, inclusive os novos puros. A lógica de `skillMarkdownForExport`/`yamlDoubleQuoted` foi validada manualmente fora do pacote (incluindo round-trip com `skillpkg.ParseSkillFrontmatter`) antes de commitar.

## Impacto
- [ ] Quebra compatibilidade com algo existente? Não — o conteúdo de `SKILL.md`/`INSTRUCTIONS.md` só ganha frontmatter quando não tinha nenhum; skills já com frontmatter continuam idênticos.
- [ ] Requer migration de banco? Não.
- [ ] Requer variável de ambiente nova? Não.
- [ ] Requer comunicar o time? Não.

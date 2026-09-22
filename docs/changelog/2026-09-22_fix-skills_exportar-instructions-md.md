# fix(skills): exportar também INSTRUCTIONS.md junto do SKILL.md

**Data**: 22/09/2026
**Branch**: main

## O que foi alterado
No zip gerado por `POST /api/skills/export`, cada pasta de skill passa a conter dois arquivos com o mesmo conteúdo primário do skill: `SKILL.md` (como já era) e agora também `INSTRUCTIONS.md`.

## Por que foi alterado
O usuário relatou que, dependendo da ferramenta/runtime que consome o skill exportado, o arquivo de conteúdo principal é esperado ora como `SKILL.md`, ora como `INSTRUCTIONS.md`. Como a entidade `skill` só guarda um único campo de conteúdo primário (`skill.content`), a forma mais simples de cobrir os dois casos é gravar o mesmo conteúdo sob os dois nomes, em vez de tentar adivinhar qual o destino espera.

## Arquivos modificados
- `server/internal/handler/skill_export_archive.go` — `ExportSkills` agora escreve `folder/INSTRUCTIONS.md` além de `folder/SKILL.md`, com o mesmo `skill.Content`.

## Como testar
1. Em `/{workspace}/skills`, selecionar 1+ skills customizados e clicar em "Export" na toolbar flutuante.
2. Abrir o `.zip` baixado e confirmar que cada pasta de skill contém `SKILL.md` **e** `INSTRUCTIONS.md`, com o mesmo conteúdo.
3. `go build ./...`, `go vet ./internal/handler/...` e `go test ./internal/handler/... -run Skill` passando.

## Impacto
- [ ] Quebra compatibilidade com algo existente? Não — apenas adiciona um arquivo extra ao zip exportado.
- [ ] Requer migration de banco? Não.
- [ ] Requer variável de ambiente nova? Não.
- [ ] Requer comunicar o time? Não.

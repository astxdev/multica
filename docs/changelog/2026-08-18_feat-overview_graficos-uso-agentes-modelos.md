# feat(overview): adicionar gráficos de uso por agente e por modelo

**Data**: 18/08/2026
**Branch**: main

## O que foi alterado
Duas novas seções na página `/{slug}/overview`:

- **"Top agents by usage"**: ranking (top 8) dos agentes que mais gastaram tokens e $ na janela de 30 dias, com avatar, barra proporcional ao custo, tokens e custo. Agentes excluídos são agregados em um bucket "Deleted agents" e agentes restritos/privados em "Other agents", sem nunca expor um UUID cru. Tem um link para o leaderboard completo em `/usage`.
- **"Usage by model"**: barra de proporção + legenda mostrando a % de uso (por tokens) e o custo de cada modelo de LLM na mesma janela de 30 dias, com os 5 modelos mais usados e o restante agregado em "Other models".

Nenhuma rota de API nova foi criada — as duas seções reaproveitam o rollup `GET /api/dashboard/usage/by-agent` que já existe e já carrega `provider`/`model` por linha; a agregação por modelo é feita no cliente.

## Por que foi alterado
Pedido do usuário: visualizar quais agentes mais consomem tokens/$ e qual a distribuição de uso e custo entre os modelos de LLM configurados no workspace, direto na visão geral do workspace.

## Arquivos modificados
- `packages/views/dashboard/utils.ts` — nova função `aggregateUsageByModel`, que dobra as linhas por-(agente, modelo) em totais por modelo (tokens, custo, task count), espelhando `aggregateCostByModel` das utils de runtimes.
- `packages/views/overview/components/overview-page.tsx` — duas novas seções (`Agents by usage`, `Usage by model`), busca de `dashboardUsageByAgentOptions` + `agentListOptions`, agregação e renderização.
- `packages/views/locales/{en,ja,ko,zh-Hans}/overview.json` — chaves de tradução `agents.*` e `models.*` para as duas novas seções, em paridade entre os 4 idiomas.

## Como testar
1. Acessar `/{slug}/overview` em um workspace com atividade de agentes nos últimos 30 dias.
2. Confirmar que "Top agents by usage" lista os agentes ordenados por custo desc, com tokens e $ corretos, e que o link "View leaderboard" leva para `/usage`.
3. Confirmar que "Usage by model" soma 100% entre os modelos exibidos + "Other models" (quando houver mais de 5 modelos), e que os valores de custo batem com os mostrados em `/usage`.
4. Rodar `pnpm typecheck`, `pnpm --filter @multica/views lint` e `pnpm --filter @multica/views exec vitest run locales overview dashboard` (todos executados e passando nesta mudança).

## Impacto
- [ ] Quebra compatibilidade com algo existente? Não.
- [ ] Requer migration de banco? Não — reaproveita rollup e endpoint já existentes.
- [ ] Requer variável de ambiente nova? Não.
- [ ] Requer comunicar o time? Não é necessário; é uma adição aditiva à página de overview.

---
schemaVersion: '1.0.0'
id: 'R-0002'
title: 'STYNX 1.5.0 — upstream DETRAN C-0002'
type: 'release'
kind: 'implementation'
status: 'active'
date: '2026-09-26'
authority: 'Architect'
goal: 'Entregar os 15 candidatos U1–U15 da especificação C-0002 como STYNX 1.5.0.'
isolation:
  kind: 'git-worktree'
  branch: 'feat/release-1-5-0'
  base_sha: '75b9966a887192121a3904fef7cfd211f8e94465'
orchestrator_prompt: 'prompts/00-maestro.md'
plan_path: 'plan.md'
---

# R-0002 — registro de execução

## Estado

Bootstrap verde após provisionar os serviços Docker da referência e o Chromium
headless do Playwright. `pnpm ci:stynx` passou com PostgreSQL na porta 55432 e
`pnpm exec devai doctor` retornou `ok: true` antes da tríade. Ver `plan.md`
§Linha de base.

## Revisões

Prompt-review do CTG-0001 por Claude Code `claude-opus-5-5` via ponte DETRAN:
dois ciclos, ambos `REVIEW`. O primeiro trouxe oito achados; o segundo
confirmou a correção dos oito e apontou um bloqueio restante sobre o UUID do
ator nominal, além de sete ajustes não bloqueantes. Plano e prompts foram
corrigidos após o segundo ciclo. O limite de dois ciclos `REVIEW` do prompt do
maestro foi atingido. O Owner autorizou uma terceira verificação excepcional
em 2026-09-26 (“Autorizado”); executar prompt 05 pela ponte antes de qualquer
despacho.
O terceiro prompt-review excepcional retornou `PASS`, com três observações
não bloqueantes incorporadas ao contrato Architect. Despacho liberado.
Worker Architect `gpt-6-sol` entregou F1, commit
`94d62ccb637a4fb6d5e5942a383235145d7e1a9b` com autoria `DEVAI Architect`.
Worker Inspector `gpt-5.6-terra` entregou sensores F3, commit
`c6f8b7fde4b450a3b4a5a8857b334b13af7617d4` com autoria
`DEVAI Inspector`. Testes focalizados falham como esperado antes da
implementação; `pnpm lint:tests`, `check:rls-negative` e `check:rls-smoke`
passaram. `pnpm check:trace --print` projetou seis novos sensores e seis
digests alterados; o rebind Architect em `law/trace.json` passou com 387/387.
O primeiro rebind foi commitado em `7170c89c`. O Engineer `gpt-6-sol` iniciou
F2. A revisão dos sensores identificou duas falhas de teste, sem alteração de
produto para acomodá-las: a role superusuária que contornava RLS em auditoria
e a localização aninhada das opções de `nestjs-cls`. O Inspector corrigiu as
duas em `1cd9bee7`; a integração pública com PostgreSQL passou 35/35,
`lint:tests` passou e o novo rebind do trace passou 387/387.
O review de código apontou downgrade indevido para público após falha de cache
ou mapper em um token já verificado. O Inspector acrescentou duas negativas
em `7d513da7`; elas falham na implementação inicial como esperado. O
Engineer está corrigindo a causa. O rebind Architect atualizado continua
387/387.
O Engineer corrigiu o downgrade, e auth 212/212, backend 292/292, integração
auth 23/23 e tenancy PostgreSQL 35/35 passaram. O commit F2 é `2a94cac0`.
`pnpm release:preview` calculou bump minor do grupo fixo para 1.5.0 apesar da
inferência major do `changeset status` bruto; `scripts/version-packages.mjs`
trata essa promoção indevida. `pnpm api:baselines:write` atualizou as
declarações públicas e `pnpm package-readmes:write` teve zero mudanças.
O rebind da API pública e o checkpoint foram commitados em `e6330a81`.
`pnpm ci:stynx` passou nesse HEAD com PostgreSQL real em `127.0.0.1:55432`:
incluiu 51 tarefas de integração, 48 de build, RLS negativo e smoke.
O delivery-review Opus 5.5 via ponte DETRAN, ciclo 1, retornou `REVIEW`:
três lacunas bloqueantes de sensores HTTP (duas ordens de módulo, ambos os
guards reais e provas de contexto) e seis achados adicionais de contrato,
código ou fixture RLS. O PR fica pendente do reparo, novo CI e PASS.
O contrato de reparo foi commitado em `d3a1b3db`, `51c2ca1b` e `8db9a681`.
Os Inspectors Codex acrescentaram oito arquivos de sensor em `bc9a8559`:
ordens HTTP core/tenancy, guards reais com tenancy, apps auth/backend sem
tenancy, bootstrap herdado, permissão nominal, cabeçalho configurado,
comparação de UUID e controle positivo/negativo de RLS como `stynx_app`.
Dois 500 iniciais eram montagem de fixture (guard sem `@Injectable()` e stub
de `SessionService` ausente) e foram corrigidos sem tocar produto. Os novos
sensores deixam explícitas as falhas de produto de entitlement, sessão
verificada backend, `@ReadOnly`, permissão nominal, marcador herdado e caixa
do UUID. `pnpm lint:tests` passou após correção de um import não usado
capturado pelo hook. A entrega do Engineer e novo rebind de trace seguem
pendentes.

## Escopo condicional

UPS-SIG, UPS-OBX e UPS-OFS estão fora da release enquanto a §8 da especificação
não contiver adenda confirmatória da R-0021 com nível decidido pelo Owner.
Na leitura de 2026-09-26, a §8 não continha adendas. Conferir novamente antes
de congelar o escopo.

## Publicações

Nenhuma. Não houve recibo de publicação, versionamento ou tentativa de publicar.

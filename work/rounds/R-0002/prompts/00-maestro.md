# Prompt do maestro — release STYNX 1.5.0 (rodada S-1.5 da campanha DETRAN C-0002)

## Emenda vigente — OD-S15-02

O Owner substituiu a cadência de PR e RC por CTG para as CTGs 5–8. Esta emenda
prevalece sobre as instruções históricas abaixo que pedem PR, merge em `main`,
CI completo ou publicação de RC entre essas CTGs. O maestro integra os quatro
grupos em ordem topológica numa única branch cumulativa, com commits separados
por papel, testes focais, rebinds e delivery-review por grupo. Depois da CTG8,
congela o escopo, prepara a versão estável e executa **um** CI local completo,
**um** PR, CI remoto e publicação final com os recibos exigidos. RC1 e RC2 já
publicados são fatos históricos; não publicar outra RC por esta emenda.

O paralelismo permitido é de trabalho em worktrees e arquivos sem lock comum:
CTG6 shell/entrypoints e CTG7 clock/calendário podem avançar enquanto a CTG5
fecha a API de transação; CTG8 pode desenvolver o parser, o plano de saída e
os sensores isolados da CLI. IFM/ETag, fake Transaction, idempotência Angular e
o consumidor gerado aguardam o checkpoint estável da CTG5. A importação é
sempre 5 → 6 → 7 → 8, com revisão e gates focais no SHA importado. Nenhum worker
executa Git. Esta emenda não altera os MUST da OD-S15-01 nem dispensa o
prompt-review independente antes de novos despachos.

Checkpoint atual: as CTGs 5–8 e a correção do envelope HTTP 409 CTG5 já
foram importadas na branch cumulativa, com delivery-review Opus PASS; os
follow-ups de observabilidade CTG5 também receberam PASS. Ler `plan.md`
§Retomada antes de qualquer nova ação. A adenda A1 §8.1 do DETRAN confirmou
SIG/OBX/OFS como MUST; a decisão Owner sobre incluí-las antes da final ou
adiá-las expressamente permanece pendente. A prévia condicional CTG9 recebeu
REVIEW até o ciclo 6, sem contrato vinculante ou worker. Não congelar nem
publicar a final antes da decisão de escopo e do trabalho correspondente.

> Sessão nova, sem contexto anterior, Codex CLI (família Codex, modelo Sol 6), aberta em
> `/Users/aarusso/Development/stynx`. Você é o **maestro** desta rodada. Tudo o que precisa está nos
> arquivos citados.

## 0. Identidade e limites

- Você é o maestro da rodada que produz e publica **STYNX 1.5.0** (próxima minor sobre o workspace
  1.4.0), a partir da especificação upstream da campanha C-0002 do DETRAN.
- Declare na primeira linha de cada resposta o papel constitucional da fase atual (Constituição
  Art. 6 do STYNX):
  - **Architect** ao planejar, contratar e fazer rebind de `law/` e dos baselines;
  - **Inspector** ao escrever testes;
  - **Engineer** ao implementar e commitar código.
    Nunca acumule papéis num mesmo commit. Commits em `law/` são autorados como `DEVAI Architect`.
- Workers: subagentes da **sua** família (Codex). Use Sol 6 para Architect e tarefas grandes, e os
  modelos Codex médio e pequeno vigentes para Inspector e Engineer. Confirme os ids com
  `codex --help`.
- Reviewer: sempre da **outra** família, **Claude Code com Opus 5.5**, no modo `prompt-review` e
  `delivery-review`. Use a ponte do DETRAN, apontando para a sua worktree:
  `/Users/aarusso/Development/detran/tools/orchestra/bridge.sh claude <id-opus-5.5> <prompt.md> <veredito.json> <worktree>`.
  Se a ponte não servir para o STYNX, registre o motivo e use `claude -p` com o mesmo prompt de
  reviewer.
- Só você executa `git`. Workers não commitam, não fazem push e não abrem PR. Nunca use `--force`.
- **Proibido sem recibo do Owner** (`law/policy/forbidden-action-authorizations.json`):
  - publicar pacotes, seja RC ou final;
  - editar workflows (`FORBID-CI-WITHOUT-ADR`);
  - qualquer outra ação da lista de ações proibidas.
    Ao chegar a um desses pontos, pare, descreva a ação exata (comando e SHA) e peça o recibo ao Owner.
- Não escreva nada no repositório DETRAN. Ele é somente leitura para esta sessão.

## 1. Bootstrap (Engineer)

```bash
git fetch -q origin --prune
git status --short | wc -l            # deve ser 0
git worktree list
git branch -a --list '*release-1-5-0*'
gh pr list --state all --limit 20
ls work/rounds                        # próximo id livre (esperado: R-0002)
```

- Se já existirem worktree, branch ou rodada desta release, **retome**: reutilize-os e continue do
  checkpoint em `plan.md` §Retomada. Nunca recrie nem replaneje.
- Senão:
  ```bash
  git worktree add -b feat/release-1-5-0 ../stynx-worktrees/release-1-5-0 origin/main
  ```
  Nessa worktree, crie `work/rounds/R-00nn/` no formato de `work/rounds/R-0001/`, com os arquivos:
  - `AUTHORIZATION.md`: Owner, GRANTED, com o escopo "implementar a 1.5.0 conforme a especificação
    C-0002". A publicação e a edição de CI **não** ficam autorizadas por esse arquivo; exigem recibo
    por ação.
  - `plan.md`
  - `record.md`
  - `prompts/00-maestro.md`, com este prompt.
- Linha de base: `pnpm install --frozen-lockfile`, depois `pnpm ci:stynx`. Se o CI não ficar
  verde, pare e reporte. Por fim, `pnpm exec devai doctor`.

## 2. Leitura obrigatória (Architect), nesta ordem, uma vez

1. `AGENTS.md`, `CLAUDE.md`, `README.md`, `law/constitution.md`, `.devai/pin/constitution.md`,
   `law/adr/`, `law/schemas/`, `docs/meta/development-contract.md` (vinculante para tenancy/RLS,
   DDL, tooling gerado e release).
2. **Especificação da release**, lida no repositório DETRAN (somente leitura):
   `/Users/aarusso/Development/detran/work/campaigns/C-0002-stynx-upstream-spec.md`, inteira. Ela
   também está em `origin/main` de `aarusso-nyx/detran`.
   - Os requisitos estão nas §1–§6.
   - A tabela de conformidade está na §7; as adendas, na §8.
   - As decisões do Owner (OD-S15-01) estão no topo do documento.
3. `/Users/aarusso/Development/detran/work/campaigns/C-0002-consolidacao.md` §3, §4, §8 e §10:
   contexto de consumo; somente leitura.

Anote em `plan.md` §Leitura o HEAD do STYNX, o HEAD do DETRAN lido e a lista do que leu.

## 3. Decisões do Owner já tomadas (OD-S15-01, 2026-09-26). Não reabra.

1. **Escopo: os 15 candidatos U1–U15 são obrigatórios.** Todo requisito `UPS-*` de U1–U15 é
   **MUST** na 1.5.0, inclusive os marcados SHOULD/MAY ou P2/P3 na especificação: TEN, SSE, NGSSE,
   AUTHZ, SES, JOB, TXN, IFM, NGERR, SHELL, TEST, HOOK, CAL, NGIDEM e CLI.
2. **Candidatas UPS-SIG, UPS-OBX e UPS-OFS.** Entram somente se a §8 da especificação trouxer
   adenda da R-0021 do DETRAN confirmando-as, com o nível fixado nessa adenda. Sem adenda, ficam
   fora desta release e são registradas em `record.md`. Confira a §8 no bootstrap e de novo antes
   de congelar o escopo.
3. **UPS-TEN-01 = opção (b).** Middleware de contexto no core, rodando antes de qualquer guard ou
   interceptor; a tenancy só enriquece o contexto. A opção (a) está descartada.
4. **UPS-TEN-02: conflito entre Host e&#x20;****`X-Tenant-Id`****&#x20;→ rejeitar** (fail-closed, código
   documentado, com teste negativo).
5. **Consumo por release candidate.** Publique `1.5.0-rc.N` (changesets em pre mode `rc`) assim que
   houver incrementos estáveis, para o DETRAN desenvolver a R-0022 em paralelo. Cada publicação
   exige recibo do Owner. O DETRAN só mescla com a `1.5.0` final.

## 4. Decomposição (Architect) → `plan.md` e tarefas

Tríade por requisito ou grupo: Architect (contrato da API, confirmado contra o código atual, que
pode divergir do nome proposto na especificação) → Inspector (testes que codificam os critérios
"Prova"/"Testes MUST" da especificação) → Engineer (implementação até os testes passarem). Um PR por
CTG, em ordem topológica, com até três tarefas sem lock comum em paralelo.

| Ordem | CTG          | Requisitos                                                      | Observações                                                                                                     |
| ----- | ------------ | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 1     | tenancy      | UPS-TEN-01…06                                                   | P0; primeiro RC                                                                                                 |
| 2     | SSE          | UPS-SSE-01…10, UPS-NGSSE-01…10, UPS-TEST-01                     | segundo RC; E2E com PostgreSQL/RLS reais e dois tenants                                                         |
| 3     | authz-sessão | UPS-AUTHZ-01…07, UPS-SES-01…03                                  | curinga com testes de presença **e** ausência                                                                   |
| 4     | jobs         | UPS-JOB-01…04                                                   | ator técnico, RLS por tenant, fuso e DST                                                                        |
| 5     | transação    | UPS-TXN-01…05                                                   | auditoria e idempotência na tx; rollback forçado                                                                |
| 6     | web-kit      | UPS-IFM-01…03, UPS-NGERR-01…04, UPS-SHELL-01…04, UPS-TEST-02…04 | axe sem `serious`/`critical`                                                                                    |
| 7     | utilitários  | UPS-HOOK-01…02, UPS-CAL-01…02, UPS-NGIDEM-01                    | feriados nunca vêm do STYNX                                                                                     |
| 8     | cli          | UPS-CLI-01                                                      | `stynx generate module --blueprint`; saída comparável ao `tools/blueprints/` do DETRAN, que o consumidor avalia |
| 9     | candidatas   | UPS-SIG/OBX/OFS                                                 | só com adenda da §8                                                                                             |

Obrigações do STYNX em cada CTG (development-contract e `AGENTS.md`):

- `pnpm api:baselines:write` quando a API pública mudar (rebind feito por Architect, depois de
  confirmar a mudança);
- `pnpm check:trace --print` e rebind de `law/trace.json` quando os testes mudarem;
- changeset do grupo fixo e `pnpm package-readmes:write`;
- testes negativos de RLS (`pnpm check:rls-negative`) e `pnpm test:int` para tudo que toca banco;
- `pnpm ci:stynx` verde antes de cada PR.

Nada de _shim_, e nada de copiar código do DETRAN: implemente a partir da especificação.

## 5. Revisão, checkpoints e merge

- **Prompt-review** do plano e dos prompts dos workers pelo reviewer, antes de qualquer despacho
  (`REVIEW` admite no máximo 2 ciclos; `FAIL` → pare).
- **Checkpoint por tarefa:** falha → triagem em uma linha em `plan.md` §Triagem
  (`plant-bug|sensor-error|policy-issue|reference-gap`) → uma nova tentativa → escalar.
  Nunca enfraqueça teste nem edite arquivo gerado à mão.
- **Delivery-review** por CTG; merge só com CI verde e PASS.
- **Evidência DEVAI** conforme `record.md`/R-0001 (`devai evidence record` e `audit observe` no merge).

## 6. Release

1. Após o merge do CTG 1: `pnpm changeset pre enter rc` (se ainda não estiver em pre mode) e depois
   `pnpm version-packages`.
   - **Pare e peça o recibo do Owner** para publicar `1.5.0-rc.1`.
   - Com o recibo em mãos, publique e registre em `record.md` a versão, os pacotes e o SHA.
2. Repita a cada CTG ou grupo estável (`rc.2`, `rc.3`, …).
3. Depois do último CTG:
   - rode `pnpm changeset pre exit`, `pnpm version-packages` e
     `pnpm release:policy && pnpm release:provenance && pnpm release:consumer-fixtures`;
   - **peça o recibo** e publique **1.5.0**.
4. Preencha `work/rounds/R-00nn/conformance-1.5.0.md` com a tabela da §7 da especificação: id,
   versão em que foi publicado, símbolos reais, testes e desvios em relação à proposta. Se algum
   requisito não sair, declare-o explicitamente (o consumidor para: OD-R22-02). Nunca publique a
   final com MUST faltando sem decisão do Owner.

## 7. Condições de parada

Grave checkpoint em `plan.md` §Retomada quando ocorrer qualquer um destes casos:

- orçamento da janela esgotado (≈ 700 k tokens de entrada; checkpoint a 80 %);
- necessidade de recibo do Owner;
- requisito da especificação incompatível com o development-contract (abra uma OD no `plan.md`);
- `FAIL` do reviewer após escalada.

Um novo maestro retoma pelo mesmo prompt.

## 8. Relatório final (última mensagem da sessão)

Inclua:

- papel declarado e rodada;
- PRs (número e estado);
- CTGs e tarefas, com o resultado de cada uma;
- ciclos de review;
- gates executados;
- RCs e final publicados (versões, recibos, SHAs);
- tabela de conformidade resumida;
- itens fora do escopo e o motivo;
- consumo estimado;
- o que o DETRAN precisa saber para R-0022…R-0024 (nomes reais dos símbolos e desvios).

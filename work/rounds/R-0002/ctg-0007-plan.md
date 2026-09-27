# CTG-0007 — utilitários

**Papel desta fase:** Architect. **Escopo:** UPS-HOOK-01…02, UPS-CAL-01…02 e UPS-NGIDEM-01; todos MUST por OD-S15-01. Contrato: `docs/framework/contracts/utilities-1.5.md`. Base de leitura: C-0002 §6.7–6.9, §7 e §8; `README.md`, constituição/pin, ADRs, schemas, development-contract. DETRAN é somente leitura. O CTG depende dos CTGs 1–6 para merge topológico e da forma final de UPS-TXN-03 para vetor canônico de fio.

## API e locks

| Tarefa | Papel     | Locks F2/F3                                                                                  | Entrega                                               |
| ------ | --------- | -------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 7A     | Inspector | `packages/integration-adapter/test/**`, `packages/backend/test/**`                           | HMAC/guard, concorrência de replay, E2E Nest          |
| 7B     | Inspector | `packages/core/test/**`, `packages/worklist/test/**`                                         | clock, fuso/DST, feriado do consumidor e dois tenants |
| 7C     | Inspector | `packages-web/angular/test/**`                                                               | opt-in, métodos, retry, canônico e vetores CTG5       |
| 7D     | Engineer  | `packages/integration-adapter/src/**`, `packages/backend/src/**`, seus manifestos e lockfile | verificador puro e guard Nest                         |
| 7E     | Engineer  | `packages/core/src/**`, `packages/worklist/src/**`                                           | relógio e calendário                                  |
| 7F     | Engineer  | `packages-web/angular/src/**`                                                                | helper/interceptor/provider Angular                   |

Architect faz contrato e prompts; reviewer externo Opus 5.5 em `prompt-review` antes de qualquer Inspector. Inspectors 7A e 7B podem rodar com locks distintos após PASS. Inspector 7C só inicia depois do contrato UPS-TXN-03 do CTG5 ter prompt-review PASS e vetores de fio reconciliados por Architect; registrar SHAs e recibo nesta seção antes do despacho. Engineer 7D–7F roda após respectivos sensores vermelhos, sem modificar testes. O maestro é o único que executa Git e faz commits por papel; `law/` apenas com autoria `DEVAI Architect`. `packages/backend/package.json`/`pnpm-lock.yaml` por 7D não compartilham lock com 7E/7F, mas Engineer deve reavaliar dependências efetivas antes de editar.

## Checkpoints

1. Reviewer lê contrato e prompts, retorna JSON `PASS|REVIEW|FAIL` com evidências. Até dois ciclos `REVIEW`; `FAIL` ou limite exigem escalada. Registrar artefato em `reviews/`.
2. Inspector adiciona testes sem enfraquecer existentes. Primeiro ciclo: falhas novas por símbolo ausente/semântica faltante, lint de testes e `pnpm check:trace --print`. Architect rebind `law/trace.json` após confirmar projeção.
3. Engineer implementa contra sensores; lint/typecheck/test focais. Falha recebe linha em §Triagem (`plant-bug|sensor-error|policy-issue|reference-gap`), uma nova tentativa, depois escalada.
4. Architect rebind API com `pnpm api:baselines:write` após validar mudanças públicas; Engineer changeset do grupo fixo, documentação de uso e `pnpm package-readmes:write/check`.
5. `pnpm ci:stynx`, `pnpm ci:reference-apps`, `pnpm check:trace --print`, `pnpm api:baselines`, DEVAI forbidden-actions e Opus `delivery-review` PASS; PR único do CTG7, merge apenas após CTG6. Evidência DEVAI no merge conforme R-0001.

## Triagem

Sem falhas registradas antes do despacho.

## Retomada

Contrato e prompts propostos, aguardando prompt-review externo e merge topológico. Não há implementação/teste iniciado neste CTG.

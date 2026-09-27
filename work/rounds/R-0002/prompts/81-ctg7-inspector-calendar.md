# CTG-0007 / Inspector 7B — relógio e calendário

Declare `Inspector`. Leia `AGENTS.md`, contrato `docs/framework/contracts/utilities-1.5.md` e C-0002 §6.8. Trabalhe só em `packages/core/test/**` e `packages/worklist/test/**`. Não edite F1/F2, generated output nem Git; DETRAN é somente leitura.

Escreva testes vermelhos para `Clock`, `SystemClock`, `STYNX_CLOCK`, `provideStynxClock` com injeção Nest real e relógio falso. `WorklistClock` legado segue compatível. Para `TenantBusinessCalendar`, use dois tenants com fusos e feriados diferentes fornecidos pelo teste, sem calendário embutido no STYNX. Valide início excluído, N dias úteis, fim de semana, feriado local, ano bissexto, troca de ano, DST para frente e para trás, limites perto de meia-noite UTC, mudança do timezone por tenant, calendárioKey, zero dias e entradas inválidas. Prove que soma por data civil, não por 24h, e que a data/instante de saída obedece ao contrato. Falha da fonte de feriados/timezone deve propagar sem fallback. Teste a integração com `StynxWorklistModule.forRoot({calendar})` e `resolveWorklistDeadline`, mantendo as provas existentes.

Rode testes focais e lint. Reporte falhas esperadas e qualquer ponto ambíguo sem escrever código para escondê-lo.

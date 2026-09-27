# CTG-0007 / Inspector 7C — idempotência Angular

Declare `Inspector`. Leia `AGENTS.md`, contrato `docs/framework/contracts/utilities-1.5.md`, C-0002 §6.9 e contrato CTG5 UPS-TXN-03 quando disponível. Trabalhe só em `packages-web/angular/test/**`. Não edite F1/F2, generated output nem Git; DETRAN é somente leitura.

Com `HttpTestingController`, prove que `provideStynxAngular` sozinho não adiciona `Idempotency-Key`; `provideStynxIdempotency` mais marcador explícito adiciona em POST/PUT/PATCH/DELETE, preserva cabeçalho preexistente, omite em GET/HEAD/SSE/não marcado, não envia `undefined`, e preserva chave da mesma operação no retry. Exercite chave explícita, opção de hash do corpo, action/target vazios e corpo não serializável. Prove `canonicalJson`/`sha256Hex` com ordem recursiva de chaves, arrays, Unicode, `null`, `undefined`, função, `toJSON`, bigint e ciclo; compare vetores com o contrato de CTG5 e provoque 409 server-side no teste de integração consumidor se a montagem desse CTG permitir. Verifique provider moderno e `StynxAngularModule.forRoot` sem registro duplicado.

Rode testes focais e lint; reporte vermelho esperado e divergência de wire format ao Architect antes de fixar assertions incompatíveis.

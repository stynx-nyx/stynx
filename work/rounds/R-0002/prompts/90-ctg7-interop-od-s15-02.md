# CTG-0007 — continuação sob OD-S15-02

Leia `ctg-0007-plan.md`, `docs/framework/contracts/utilities-1.5.md`,
o veredito Opus `reviews/ctg7-delivery-review-2.json` e
`/Users/aarusso/Development/stynx-worktrees/release-1-5-0/work/rounds/R-0002/OD-S15-02-flow.md`.
Esta branch já contém a implementação HOOK/CAL/NGIDEM e o reparo Unicode.
Não recomece o trabalho nem apague seus sensores. O maestro é o único que
executa Git; commits de papéis diferentes permanecem separados.

Após CTG5 fornecer `TransactionalCommand` e um 409 real para
chave/corpo divergentes, Architect confere o vetor canônico de fio;
Inspector acrescenta a prova HTTP 409 faltante em teste próprio e
registra red/green; Engineer altera F2 somente se o teste revelar defeito.
Use PostgreSQL/RLS real onde houver banco. Faça rebind de trace/API quando
o delta exigir e teste os pacotes afetados. Depois da CTG6, o maestro
importa o trabalho nesta branch para a candidata cumulativa, reconciliando
`packages/backend` e `packages-web/angular` sob locks exclusivos e
solicitando delivery-review Opus do delta integrado. Não executar full
`pnpm ci:stynx` nem apps de referência como gate desta CTG; não abrir PR,
não publicar RC. O único CI completo/PR/CI remoto/publicação final segue
após CTG8.

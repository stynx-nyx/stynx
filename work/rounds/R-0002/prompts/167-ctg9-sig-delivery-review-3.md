# CTG9 SIG — delivery-review ciclo 3

Você é Claude Code Opus 5.5, reviewer independente em modo
`delivery-review`, somente leitura. Leia `AGENTS.md`, o
`docs/meta/development-contract.md`, os ADRs de assinatura, o contrato
`work/rounds/R-0002/ctg9-sig-contract.md`, a adenda A1 §8.1 da
especificação DETRAN C-0002 (somente leitura), e os vereditos
`reviews/ctg9-sig-delivery-review-{1,2}.json`. Examine a implementação
atual em `packages/signature/src/**` e os sensores Inspector em
`packages/signature/test/**`, inclusive fixtures PKI reais. Não edite
arquivos, não execute Git e não escreva no DETRAN.

Reavalie todos os bloqueios do ciclo 2: vínculo criptográfico do
SignerInfo ao certificado indicado e ao primeiro ESSCertIDv2;
verificação B-LT sem fetchers obrigatórios, incluindo TST, DSS/VRI e
revogação do signatário/TSA/cadeia; seleção da assinatura no PDF,
ByteRange e restrição das revisões incrementais pós-assinatura a DSS;
proveniência/branding do verificador em manifesto e retirada; e
distinção de indisponibilidade e invalidade. Procure contraprovas
concretas nos cenários de dois PDFs, DSS comprimido, certificado
errado, OCSP/CRL revogado, TSA faltante, mutação pós-assinatura,
signatário A/B e manifestação incompleta. Classifique lacunas de
teste separadamente de defeitos de implementação. PASS libera apenas
o commit da fonte SIG, não a conformidade ou publicação.

Retorne JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.

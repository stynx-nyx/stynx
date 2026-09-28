# STYNX 1.5.0 final — prompt-review focal 2

Você é Claude Code Opus 5.5, reviewer independente em modo
`prompt-review`, somente leitura. Releia `AGENTS.md` e autoridades,
`work/rounds/R-0002/final-release-context-contract.md`, prompts
179/180, o parecer do primeiro ciclo registrado em
`reviews/final-release-prompt-review-1.bridge-failure.md`, e a política
Architect commitada em `law/policy/registry-version-anomalies.json`.
Consulte os scripts e testes de release citados no prompt 181 para
conferir a viabilidade. Não edite, não execute Git, não publique e não
escreva no DETRAN.

Verifique os quatro bloqueios do ciclo 1: (1) todos os campos mutáveis
de `owner_decision`, `supersedes`, fechamento e ordem do commit Architect
estão fixados; (2) após o marcador só A/M em `work/rounds/R-0002/**`
ou M em `law/policy/forbidden-action-authorizations.json`; (3) o pai
do marcador conserva pre mode `rc`, e `pre exit`/versionamento/READMEs
entram no mesmo commit que apaga `pre.json` e changesets; (4) apenas
o teste de igualdade entre política final e manifestos RC3 pode seguir
vermelho até o marcador, todos os outros devem passar. Confira os seis
arquivos de apoio M, export separado `isFinalVersionedCandidate`,
assinatura fixa, testes RC preservados e atribuição dos gerados ao
verbo de versionamento. Base observada `origin/main` é
`493fcd959592d30055dcacabd57e4cc19505f2c6` em RC3 pre mode; RC2
é a última publicação. PASS libera Inspector, não publica nem declara
o release pronto.

Retorne JSON puro:
`{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path:line","issue":"fato concreto","required_change":"reparo específico"}],"summary":"resumo"}`.

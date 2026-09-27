# Cross-family delivery-review — CTG-0002 SSE / NGSSE

You are Claude Code Opus 5.5, independent read-only reviewer. Review
`feat/release-1-5-0-sse` against merged CTG-0001 baseline
`e09bd6c00d56881fb5208a5e8fccfd6de3c0186a`, using the upstream
DETRAN campaign specification read-only and the confirmed STYNX
contract `docs/framework/contracts/sse-1.5.md`. Prompt-review passed
in cycle 3 with Owner authorization. The CTG covers UPS-SSE-01…10,
UPS-NGSSE-01…10 and UPS-TEST-01. The conditional UPS-OBX candidate is
outside scope unless DETRAN §8 receives an adenda.

Inspect especially: stream preflight before headers, explicit tenant and
actor context for every timer tick, real data Database versus core
Database, FORCE RLS with two tenants, visible and hidden cursor behavior,
204 for expired cursor, retry/quota and disconnect cleanup, complete SSE
framing, metrics and payload limits. For Angular inspect the actual
intercepted HttpClient transport, bearer refresh/replay, tenant and
request-ID headers, raw Retry-After, no error banner, bounded reconnect
and polling, 204 cursor reset, terminal auth, logout and tenant change,
frame parser and published testing entry. Compare real exported names
against the Architect contract and flag every unsupported requirement.

Tests are in backend unit, Angular HTTP/lifecycle and reference API
integration. The reference test must prove A-positive and B-negative
behavior with PostgreSQL RLS, not a mocked tenant predicate. Check
`law/trace.json`, public API baselines, changeset, package README,
`pnpm check:rls-negative`, `pnpm test:int`, focused reference API
integration, `pnpm ci:reference-apps` and full `pnpm ci:stynx` logs
when complete. Full CI passed at `/private/tmp/stynx-s15-ctg2-final-ci.log`; reference apps CI passed at `/private/tmp/stynx-s15-ctg2-reference-ci.log`. The local PostgreSQL test fixture runs at
`127.0.0.1:55432`.

Do not edit files, mutate Git, publish, or write in DETRAN. Return only
JSON:

{"verdict":"PASS|REVIEW|FAIL","findings":[{"severity":"blocking|nonblocking","file":"path","issue":"specific issue","required_change":"concrete repair"}],"summary":"short rationale"}

PASS permits a PR after gates are green; REVIEW requires repair and
another delivery-review; FAIL escalates. No Markdown fences.

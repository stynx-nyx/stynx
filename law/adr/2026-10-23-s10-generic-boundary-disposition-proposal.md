---
adr_id: ADR-DEVAI-ADOPTION-0033
title: Scripted Transaction and browser generic boundary disposition
status: accepted
date: 2026-10-23
authors: ['Architect']
tags: [stynx, testing, sdk, angular, compatibility]
---

# ADR-DEVAI-ADOPTION-0033 — Generic boundary disposition

**Status:** Accepted on 2026-10-24 with **F2 and B1 selected**; implementation and independent verification remain required. The original proposal date and filename are retained for provenance.

**Authority:** On 2026-10-24 the Owner supplied two separate exact answers: **“Approve F2: exact two-site legacy exception”** and **“Approve B1: honest browser APIs and caller migration”**. F2 preserves exactly the two existing assertions in `packages/testing/src/fake-transaction.ts`, with the narrow census/enforcement below; it does not authorize B2's four browser assertions. B1 authorizes the honest browser transport/service APIs and bounded caller/result migrations described below. These choices are separate from ADR0032's result-representation approval and do not approve ADR0034, supplemental archive public types, a release line, publication or DETRAN/PORM acceptance.

## Selected decisions and preserved alternatives

1. **F2 selected:** preserve createFakeTransaction's current public/runtime contract with the exact existing two-site exception. O5/SM11 are superseded only for those two assertions under the required census, retained gates and disclosed acceptance wording. No new casts, blanket file suppression or additional helper escape is authorized.
2. **B1 selected:** use truthful unknown-returning browser APIs, optional explicitly checked calls and actual caller migration, preserving existing successful values, transport/SSE behavior and the exact result discrepancies inventoried below. Ordinary DTO guards remain within O5; no per-endpoint approval is required for that work.
3. **F1 and B2 not selected:** their original designs are retained below as historical alternatives, not executable authority. Do not fall back to B2 if B1 migration is difficult. F2 cannot be described as universal zero-unsafe enforcement; B1 does not turn arbitrary undecoded payloads into validated T.

Release classification, publication, formal DEVAI acceptance and downstream acceptance remain separate. The selected design supplies authority, not a passing sensor or completed SM11 verdict.

## Evidence and bounded census

### Fake Transaction

`docs/framework/contracts/web-kit-1.5.md`, Published testing helpers, explicitly authorizes `createFakeTransaction` returning an actual Transaction and says internal casts needed for PG's broad client interface stay inside the helper. The implementation was authorized under that historical contract. The later S10 plan's phase-zero disposition explicitly replaces305 unsafe assertions with validation/type guards and requires all installed unsafe rules at error; O5 forbids new suppressions. This is a conflict between preserved compatibility and the newer completion target, not unauthorized historical work.

`packages/testing/src/fake-transaction.ts` has two relevant existing assertion sites: its scripted result envelope narrowed to the generic Transaction.query return and its query-only object double-asserted to createDrizzle's PoolClient argument. The rowMode const assertion is outside this census. Direct workspace uses are five cases in `packages/testing/test/fake-transaction.spec.ts` and one published-helper case in `packages/data/test/unit/transaction.spec.ts`; external callers are not bounded by that count.

Existing tests require actual Transaction/instanceof, query and execute(sql), scripted Error identity, enqueue/order/logging, reader archive-delete guards, closed-transaction errors and select object/array rowMode behavior. Preserve scripted row/rowCount/value identity; do not use missing identity assertions as permission to change it. The README reserves real builder/RLS/savepoint/rollback guarantees for real PostgreSQL even though current select rowMode assertions must remain covered.

A promise-only object cannot prove PoolClient's callback/event/stream/lifecycle contract. A constructor port alone does not satisfy Drizzle0.45.2 NodePgClient. An arbitrary caller-selected T cannot be validated from unknown scripted rows without a schema. The preserved raw Transaction.query generic is already explicitly unchecked compatibility; moving the assertion into an overload, Reflect call, type predicate, ambient declaration or different module does not establish row validity.

Drizzle pg-proxy is a genuine callback driver but has a different result HKT; it is not a drop-in StynxDrizzleDatabase. drizzle.mock builds queries with an empty client, not these execution results. The public pg Query/Submittable path returns the submitted object and does not provide a supported promise-result injection seam for ordinary string/config calls. A wire simulation would reconstruct values/rows/errors and add protocol machinery, so no identity-preserving minimal adapter is established by this review. This is not a proof that every future adapter design is impossible.

### Browser boundaries

Four current unsafe assertion sites occur in three public classes plus a forwarding façade:

| Source                                                                                 | Public contract and current runtime                                                                                                                                                                                                                            |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages-web/sdk/src/api-client.ts`, empty/body return assertions (inspection108/111) | StynxApiClient.get/post/delete/request<T> promise arbitrary T. Empty success returns undefined; text stays string; malformed JSON success throws SyntaxError.                                                                                                  |
| `packages-web/sdk/src/transport.ts`, final body assertion (inspection148)              | StynxHttpTransport.request<T> promises arbitrary T. Empty success returns undefined; malformed apparent JSON falls back to original text. Existing401 refresh/retry and error behavior must remain. StynxSdkClient's five generic verbs forward this contract. |
| `packages-web/angular/src/event-stream.ts`, parsed payload assertion (inspection312)   | StynxEventStreamService<T>.events$ claims T, but provider config has no decoder or relationship to the injected generic. Invalid JSON is ignored; valid frames advance cursor/dedup/live state even when filtered.                                             |

Lint Engineer's source census finds151 explicit generic call expressions across six consumers: angular-flow105, angular-iam28, angular-audit4, angular-profile3, angular-trash6, angular-sessions5. Some already request unknown; these are not151 distinct response schemas. Structural generic ports exist in Flow and sessions. Audit/Profile/IAM/trash use StynxSdkClient; the reference Flow provider supplies the actual SDK. No production StynxApiClient construction or explicitly generic event-stream injection was found, but both are public/tested APIs. This is a handwritten-source census, not a new exclusion of generated SDK files. Temporary evidence is `/tmp/stynx-web-generic-callers.txt` and the Engineer strict-lint JSON files; durable acceptance must bind the final source and declarations.

## F1 — Historical alternative, not selected: honest scripted-helper replacement and migration

An implementable honest helper avoids the false full-client and generic-row claims altogether. For example, replace the helper's public transaction value with a distinct scripted execution harness:

```ts
interface ScriptedQueryResult {
  rows: Array<Record<string, unknown> | unknown[]>;
  rowCount: number | null;
  command: string;
  oid: number;
  fields: readonly unknown[];
}
interface ScriptedQueryTransaction {
  readonly role: StynxDataRole;
  query(text: string, values?: unknown[]): Promise<ScriptedQueryResult>;
  execute(statement: SQLWrapper): Promise<ScriptedQueryResult>;
  run<Q extends TypedQuery>(query: Q, params: z.input<Q['params']>): Promise<ResultOf<Q>>;
  close(): void;
}
```

The implementation retains the existing queue and exact scripted rows/errors; compiles SQLWrapper using the public PostgreSQL dialect compiler; routes typed run through the existing checked executor; and retains query logging and closed-state checks. It does not pretend to implement PoolClient, Transaction or NodePgDatabase. A separate explicitly named remote-driver builder fixture could use pg-proxy with its actual types if consumers need builder tests.

Migration example:

```ts
// Before: the type argument asserts an arbitrary result without evidence.
const result = await fake.transaction.query<{ id: string }>('select id from items');
// After: runtime payload is unchanged; callers validate what they consume.
const result = await fake.transaction.query('select id from items');
const row = itemRowSchema.parse(result.rows[0]);
// Or use an existing typed repository definition.
const item = await fake.transaction.run(itemById, [id]);
```

This is a genuine breaking public change: FakeTransaction.transaction is no longer assignable to Transaction and no longer passes its instanceof test; arbitrary generic query arguments disappear; archive operations and NodePg builders are not supplied by this minimal harness. It therefore cannot simply replace the implementation while retaining the old contract. An approved migration must replace the old helper contract, update public examples and consumers, and preserve the reader/archive, actual Transaction, select rowMode and guard assertions through genuine Transaction/driver tests rather than delete coverage to pass lint. Existing helper tests affected by the deliberately removed public guarantee need explicit contract-aware redesign. If a deprecation window retains the old helper, its two unsafe sites remain until a later removal, so F1 alone does not immediately clear SM11. Release classification is separate.

## F2 — Selected: exact existing two-site compatibility exception

This preserves createFakeTransaction and every current public/runtime/test guarantee. The Owner explicitly supersedes O5 only for the two existing assertions in this one file and amend SM11's acceptance statement accordingly. No new casts, generic adapters, extra helpers or public input changes are allowed. Neither site is claimed to validate TRow or establish a complete real PoolClient; the helper remains a deterministic test implementation of its documented used surface.

Engineer/Inspector must use the narrowest auditable mechanism that permits only native diagnostics emitted at the two exact approved assertion sites, with exact rule and assertion projections. The independent syntax census must retain exactly two approved sites; it must not assume the installed rule emits two diagnostics. The corrected typed harness observes one native PoolClient diagnostic at77:18–77:77; the unchanged result envelope is assignable to QueryResult<QueryResultRow>. Preserve exact native diagnostic identity/location and raw-rule delegation everywhere outside the approved projections, rather than manufacturing a second failure. A blanket file-level unsafe-rule disable is forbidden. An Inspector census must fail if the allowlisted expression changes, another unsafe assertion appears, an unrelated unsafe rule is suppressed or the scope expands. The rule remains at error everywhere else. Existing behavior tests stay intact; add row/error identity and exact rowMode/rowCount checks where needed. Real database tests remain mandatory for real driver/RLS/lifecycle semantics.

The resulting acceptance wording must say **strict workspace enforcement with the approved two-site legacy testing exception**, never “all unsafe rules passed without exceptions” or “all rows are validated.” Formal DEVAI acceptance must disclose this deviation. This is a completion-scope amendment, not an audit/RC bypass; all other gates and the amended exception-census gate must pass normally.

## B1 — Selected: unknown transport results, optional checked calls

The runtime-preserving core correction removes arbitrary generic claims:

```ts
type ResponseDecoder<T> = (value: unknown) => T;
// Existing request options and parameter order remain available.
request(options: StynxTransportRequestOptions): Promise<unknown>;
// A separately named additive method avoids ambiguous legacy overloads.
requestChecked<T>(options: StynxTransportRequestOptions,
                  decode: ResponseDecoder<T>): Promise<T>;
```

StynxSdkClient's get/post/put/patch/delete and StynxApiClient's request/get/post/delete return Promise<unknown> without a decoder. A checked companion can call the existing request once and then the decoder, without assertions. It must not change headers, body parsing, retries, refresh, cancellation or error timing in the untyped path. Preserve the two clients' distinct malformed-JSON semantics and empty responses. A decoder may reject values previously returned; that is an explicit opt-in checked-call behavior, not a claim that the old transport already validated responses.

Migration example:

```ts
// Existing explicit generic calls become honest unknown calls.
const body = await sdk.get('/items');
const items = itemListSchema.parse(body);
// Or opt into the checked companion with an authoritative decoder.
const checkedItems = await sdk.transport.requestChecked(
  { method: 'GET', path: '/items' },
  (value) => itemListSchema.parse(value),
);
```

All151 syntactic sites and structural ports must be reviewed: preserve existing unknown consumers; reuse actual existing endpoint validators where available; identify missing authoritative schemas. Do not add an optional decoder while leaving undecoded Promise<T> results. Do not fabricate a generic type guard or accept a permissive object as proof of a concrete DTO. For built-in endpoint clients, O5 already authorizes guards/decoders rejecting malformed responses against their existing authoritative DTOs. No per-endpoint Owner approval is required for that implementation. New normalization or rejection of legitimate current shapes is different: preserve those values and apply only the concrete public type corrections below. Missing host server implementations do not invalidate an existing published frontend DTO contract, but do limit claims of live downstream acceptance.

For event streams, the smallest runtime-preserving correction is a non-generic StynxEventStreamService whose events$ contains StynxEventStreamEvent<unknown>. Keep the generic event value interface for already-decoded values. Config/provider construction and stream state transitions remain unchanged. Typed consumers decode downstream:

```ts
const typedEvents$ = stream.events$.pipe(
  map((event) => ({
    ...event,
    data: eventPayloadSchema.parse(event.data),
  })),
);
```

Downstream decoder failure affects that consumer subscription according to RxJS semantics; it must not retroactively change the source stream's cursor/dedup/retry state. Do not put a new mandatory decoder into the shared SSE config without a separate design for failed-frame cursor, replay and polling semantics. Removing the service generic is a public compile-time migration, not a new wire protocol or runtime validator.

## B2 — Historical alternative, not selected: explicit retained browser generic compatibility

Alternatively, the Owner could retain exactly the four existing browser assertions with a bounded compatibility census analogous to F2. This preserves public generic calls and runtime behavior but explicitly leaves those payloads unchecked and amends O5/SM11 for four additional sites. It grants no new casts or extra response-shape claims. This option is not implied by choosing F2, and is not the recommended invisible fallback if B1 caller migration proves larger than expected. A checked API may be added independently, but adding it does not make existing generic calls validated.

## Acceptance and remaining evidence

Inspector must bind exact failing sites, behavior regressions and emitted public consumer examples to the selected option. Architect updates the old helper/browser contract text under the selected F2/B1 decisions, preserving its historical authority, and regenerates official public API baselines for intended changes. A retained exception requires exact census enforcement and honest amended SM11/formal-acceptance wording; an honest API redesign requires actual caller migration and no replacement cast in consumers. No test weakening, hidden ignore pattern, scope downgrade or manually edited baseline is authorized.

The grouped census below supplies the bounded B1 migration plan; it does not request151 endpoint approvals. Existing O5 covers ordinary DTO validation. The new public decision covers unknown generic results, the specifically evidenced result-type discrepancies and forwarded-body methods. Existing independent work, active S7/S8 integration, ADR0032, security remediation and downstream acceptance remain separate.

## B1 response-contract census and implementation checklist

Architect independently counted the151 handwritten generic calls by balanced type-argument scanning of the six files; this is source analysis, not a passing test/lint run. Reuse array/page combinators rather than151 independent schemas. Existing TypeScript DTOs are authority for their documented shapes even where the host supplies its own controller. Validation must preserve extra fields and object identity where the prior adapter forwards the response: an identity-preserving guard is preferable to a schema that strips keys or clones/normalizes values. Do not import backend Node/Nest modules into browser bundles to reuse schemas; mirror the existing contract in browser-safe validation with parity tests.

| Family / calls     | Reusable response contracts                                                                                                          | Authority and migration                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Flow design31      | Scope, Graph, Node, Edge, AgentRule, NodeFormRule, TransitionEffect, PolicySet, PolicyRule, with list variants                       | `angular-flow/src/types.ts`; `docs/framework/contracts/flow-api.md`; Flow design store, graph helpers and platform0014/0015. Validate required fields and currently accepted optional forms; apply the exact nullable corrections below.                                                                                                                                     |
| Flow forms26       | Form, Question, Score, Fill, Answer, Waiver, with list variants                                                                      | Same frontend types; FlowFormsService, fixed form table map, platform0014. Keep arbitrary Answer.value/attachment as unknown, question options' existing array-or-record union, and numeric score strings.                                                                                                                                                                   |
| Flow runtime22     | Run, NodeRun, Task, Event/activity, TaskCandidate, TaskUser; arrays/pages reuse these                                                | Runtime read model, task dispatch, run lifecycle, platform0014 and frontend types. Include legal expired status and nullable projections; keep node-run skipped in the existing public union even though current platform enum is narrower.                                                                                                                                  |
| Flow analytics3    | Page<OpenTask>, Page<RunSummary>, DashboardAnalytics                                                                                 | FlowAnalyticsService and flow-api contract. Existing count/percentile conversions produce numbers; do not replace them with integer-only or new range restrictions. Raw aggregate timestamps differ from explicit graph publication timestamps.                                                                                                                              |
| Flow graph packet3 | GraphExport (2), PublishGraphResponse (1)                                                                                            | graph-package.ts and explicit publication contract. Reuse all nested design validators; preserve policySets/policyRules as declared unknown-valued records; retain existing graph status derivation.                                                                                                                                                                         |
| Flow common20      | delete acknowledgement15; ensure-run id1; facts/signal records2; effect-dispatch summary1; policy decision1                          | Existing controller/service response constructors. A record validator is sufficient where the actual public contract is Record<string, unknown>; it is not substituted for a concrete DTO elsewhere.                                                                                                                                                                         |
| IAM28              | User, UserDetail, Role, Group, Permission, EffectivePermissions plus page/array wrappers:17 calls; ignored/forwarded-body actions:11 | `angular-iam/src/types.ts`, api service and reference/unit fixtures. Keep User.status open string, existing optional/null fields and optional grant metadata; do not restrict it to the four example statuses. The repository's backend identity-admin is an adapter service, not a full implementation of every `/admin/*` route; host route acceptance remains downstream. |
| Audit4             | AuditPage2, AuditEventDetail1, AuditIntegrityReport1; nested event/actor/entity shapes                                               | Exact response contract `docs/framework/contracts/audit-events-api.md` matches frontend types. Preserve unknown-valued metadata, optional nullable before/after and opaque string cursors. Existing `_audit/log` controller is a separate route, not evidence for the curated endpoint's payload.                                                                            |
| Profile3           | PlatformProfile2, PreferencesDocument1                                                                                               | `preferences/src/types.ts`, schema.ts, PreferencesController/Service match frontend types. Four preference-category shapes are already authoritative. Preserve nullable avatar/display/time fields and original response object; validate both SDK and Angular HttpClient branches consistently.                                                                             |
| Trash6             | Existing unknown normalizer1; forwarded-body actions5                                                                                | Keep existing alias/fallback behavior in normalizePage/normalizeItem, including arrays treated as objects, items/data, total/count, snake/camel names and empty defaults. No new strict wire DTO is needed for list; five action returns follow the body disposition below.                                                                                                  |
| Sessions5          | Legacy-compatible active-session list1; mutation-result-or-null2; forwarded-body legacy actions2                                     | SdkSessionsAdapter's aliases/fallbacks; `sessions/src/control/types.ts` and SessionControlController/Service. Retain alias support and normalization order, allow null inputs already coalesced to empty strings, and keep mutation null/undefined→null mapping. Split the list guarantee shape from the full mutation guarantee.                                            |

The six Flow groups sum105; other families sum46. This grouping does not add a schema for every array/page repetition. Framework HTTP envelopes, authentication failures and transport body parsing remain separate from these successful-response DTO contracts.

### Exact Flow result corrections included in accepted B1

The backend's camelizeDesignRow/camelizeRow copies values rather than removing nulls. Platform0014 makes the following projected columns nullable. Widen only these existing optional result properties to include null; keep optional construction forms. Do not erase null properties, convert null to undefined, or reject legitimate rows.

| Result DTO                             | Existing properties that need null admitted                          |
| -------------------------------------- | -------------------------------------------------------------------- |
| FlowGraph                              | name, description                                                    |
| FlowNode                               | name, quorumRatio, entryRule, exitRule                               |
| FlowEdge                               | action, rule                                                         |
| FlowAgentRule                          | permissionKey, userId, resolverKey                                   |
| FlowTransitionEffect                   | nodeCode, action                                                     |
| FlowNodeFormRule                       | threshold                                                            |
| FlowPolicySet                          | name, description                                                    |
| FlowPolicyRule                         | nodeCode, statusCode, action, capability, reasonCode                 |
| FlowNodeRun                            | nodeName, when projected from nullable nodes.name                    |
| FlowTask / inherited FlowOpenTask      | nodeName, assigneeId, assigneeUserId, decidedAction, note, dueAt     |
| FlowForm                               | description                                                          |
| FlowFill                               | runId, nodeRunId, taskId                                             |
| FlowWaiver                             | questionId, waivedBy, expiresAt                                      |
| FlowEvent / alias FlowRunActivityEvent | nodeId, taskId, actorId, note, facts                                 |
| FlowTaskUser                           | externalSubject, locale (auth.users permits null; email is NOT NULL) |

Add `expired` to FlowTaskStatus: it is already a legal value in flow.task_status and raw task reads expose it. Do not remove existing public statuses merely because a particular backend enum is narrower. Required IDs/booleans/record shapes are still validated; this is not a broad unknown-row allowance.

HTTP JSON representations need a distinct narrow caveat: ordinary raw Date timestamps serialize to strings, while valid PostgreSQL infinity and out-of-JavaScript-range Date values can serialize to null. For the existing raw timestamp output fields FlowEvent.createdAt and FlowRunSummary.firstCreatedAt/lastUpdatedAt, admit string|null, preserving optionalness. dueAt/expiresAt already appear in the nullable table above. Do not reuse ADR0032's raw Date|string|number union for browser JSON payloads. Graph publishedAt comes from a checked string in graphPublishMeta or an explicit current-time ISO conversion and does not need this broadening. Inspector must bind the wire serialization cases; this review is source-supported rather than a newly executed HTTP test.

Flow write methods currently use Partial<FlowDto> for several requests. Freeze their existing request domains while widening result nullability: introduce explicit request aliases matching the old input shapes or reuse the existing input DTO authority. Do not accidentally allow new null request values merely because result fields now admit null. Keep graph publish, input parsing, SQL and response values unchanged. Preserve existing JSON extension fields and numeric-as-text representations; do not substitute frontend convenience coercions.

### Session list guarantee correction

SessionControlService.list intentionally returns a guarantee without accessTokenExpiresAt; SessionView explicitly declares Omit<SessionGuarantee, 'accessTokenExpiresAt'>. The frontend active-session guarantee currently reuses the full mutation guarantee, which requires that field. Introduce a distinct active-session guarantee shape allowing that field to be absent while retaining old full-object construction compatibility; keep StynxSessionMutationResult.guarantee and per-result guarantees complete. Do not synthesize an expiration value. The active-session adapter's expiresAt output remains string because its existing nullish fallback already maps null/undefined input to `''`; admit those input forms without changing that existing normalization.

### Eighteen forwarded-body methods

These are not eighteen missing schemas. Their declared void result conveys no payload shape, while the current implementation returns the transport's actual successful body:

- IAM11: disableUser, reactivateUser, inviteUser, forceLogoutUser, setUserRoles, setUserGroups, deleteRole, setRolePermissions, deleteGroup, setGroupRoles, setGroupMembers.
- Trash5: restore, restoreWithCascade, hardDelete, bulkRestore, bulkHardDelete.
- Sessions2: revoke, revokeOthers.

B1 requires truthful Promise/Observable<unknown> return types for these exact methods and the corresponding adapter/action callback types. Preserve the successful value and existing side effects. Existing consumers that merely await/subscribe can continue to ignore it; migration updates explicitly void-typed action plumbing to unknown. Existing host adapter implementations returning void remain assignable to unknown-returning ports. Do not require `z.undefined()`, discard the body, or use an overload to pretend it was undefined. In particular SessionControlController returns structured200/202 SessionMutationResult for the two legacy revocation routes; older hosts may return empty success, so globally requiring the modern result would also reject a legitimate compatibility form. Existing `*WithStatus` methods retain their separately validated result-or-null contract.

### Remaining contract limits, not new approval gates

No additional mandatory decoder input is needed for the untyped transports. Typed checked calls require an explicit decoder; ordinary built-in DTO guards and malformed-data failures are covered by existing O5. Public unknown-return changes, the exact Flow/session result corrections and forwarded-body declarations are the bounded new B1 public decision. The APIs do not promise a validated arbitrary application T without a decoder.

IAM host routes and curated audit/trash host bindings have public frontend contract or normalizer evidence, not universal live host proof. Do not close DETRAN/PORM acceptance from these local validators. No missing authoritative schema was found for the declared concrete DTOs once the documented discrepancies above are accounted for; opaque facts, JSON extensions and ignored action bodies remain honestly unknown as designed. During implementation, a genuinely additional supported value or exported shape must be reported as a concrete delta, not used to infer blanket permission or demand another approval for routine validation.

Inspector's bounded acceptance matrix should cover one representative of every reusable DTO, all nullable/enum/legacy-alias discrepancies, extra-field preservation, object/value preservation, the18 body-forwarding methods, both malformed-JSON transports, refresh/cancellation, SSE cursor semantics, and packed consumer type migration. Existing assertions remain intact; guards must reject malformed values without changing valid payloads or stripping extension keys.

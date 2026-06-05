[**@stynx/flow**](../index.md)

---

[@stynx/flow](../index.md) / FlowRuntimeService

# Class: FlowRuntimeService

Defined in: [flow-runtime.service.ts:80](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L80)

## Constructors

### Constructor

> **new FlowRuntimeService**(`db`, `requestContext`, `adapters`): `FlowRuntimeService`

Defined in: [flow-runtime.service.ts:81](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L81)

#### Parameters

##### db

`Database`

##### requestContext

`RequestContext`

##### adapters

[`FlowAdapterRegistry`](FlowAdapterRegistry.md)

#### Returns

`FlowRuntimeService`

## Methods

### acceptTask()

> **acceptTask**(`id`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:374](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L374)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### actTask()

> **actTask**(`id`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:346](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L346)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### assignTask()

> **assignTask**(`id`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:358](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L358)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### declineTask()

> **declineTask**(`id`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:380](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L380)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### dispatchPendingEffects()

> **dispatchPendingEffects**(`input?`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:549](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L549)

#### Parameters

##### input?

`unknown` = `{}`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### ensureRun()

> **ensureRun**(`input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:87](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L87)

#### Parameters

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### getNodeRun()

> **getNodeRun**(`id`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:279](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L279)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### getRun()

> **getRun**(`id`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:155](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L155)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### getRunFacts()

> **getRunFacts**(`id`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:221](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L221)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### getTask()

> **getTask**(`id`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:332](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L332)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### getTaskUser()

> **getTaskUser**(`id`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:483](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L483)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### listEvents()

> **listEvents**(`query?`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:497](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L497)

#### Parameters

##### query?

`FilterInput` = `{}`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### listNodeRuns()

> **listNodeRuns**(`query?`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:245](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L245)

#### Parameters

##### query?

`FilterInput` = `{}`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### listRunEvents()

> **listRunEvents**(`runId`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [flow-runtime.service.ts:207](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L207)

#### Parameters

##### runId

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

---

### listRunNodeRuns()

> **listRunNodeRuns**(`runId`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [flow-runtime.service.ts:181](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L181)

#### Parameters

##### runId

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

---

### listRuns()

> **listRuns**(`query?`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:121](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L121)

#### Parameters

##### query?

`FilterInput` = `{}`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### listRunTasks()

> **listRunTasks**(`runId`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [flow-runtime.service.ts:194](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L194)

#### Parameters

##### runId

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

---

### listTasks()

> **listTasks**(`query?`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:293](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L293)

#### Parameters

##### query?

`FilterInput` = `{}`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### listUsersForRole()

> **listUsersForRole**(`role`, `search?`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [flow-runtime.service.ts:458](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L458)

#### Parameters

##### role

`string`

##### search?

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

---

### objectInput()

> **objectInput**(`input`): `Record`\<`string`, `unknown`\>

Defined in: [flow-runtime.service.ts:899](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L899)

#### Parameters

##### input

`unknown`

#### Returns

`Record`\<`string`, `unknown`\>

---

### signal()

> **signal**(`input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:527](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L527)

#### Parameters

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### taskCandidates()

> **taskCandidates**(`id`): `Promise`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [flow-runtime.service.ts:398](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L398)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>[]\>

---

### unacceptTask()

> **unacceptTask**(`id`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:386](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L386)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### unassignTask()

> **unassignTask**(`id`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:368](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L368)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### updateRun()

> **updateRun**(`id`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:159](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L159)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

---

### withdrawTask()

> **withdrawTask**(`id`, `input`): `Promise`\<`Record`\<`string`, `unknown`\>\>

Defined in: [flow-runtime.service.ts:392](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/flow-runtime.service.ts#L392)

#### Parameters

##### id

`string`

##### input

`unknown`

#### Returns

`Promise`\<`Record`\<`string`, `unknown`\>\>

[**@stynx-nyx/core**](../index.md)

---

[@stynx-nyx/core](../index.md) / SystemContext

# Class: SystemContext

Defined in: [packages/core/src/system-context.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/system-context.ts#L16)

## Constructors

### Constructor

> **new SystemContext**(`requestContext`, `requestContextMutator`, `sink?`): `SystemContext`

Defined in: [packages/core/src/system-context.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/system-context.ts#L19)

#### Parameters

##### requestContext

[`RequestContext`](RequestContext.md)

##### requestContextMutator

[`RequestContextMutator`](RequestContextMutator.md)

##### sink?

[`SystemOperationSink`](../interfaces/SystemOperationSink.md)

#### Returns

`SystemContext`

## Methods

### current()

> **current**(): [`SystemExecutionContext`](../interfaces/SystemExecutionContext.md)

Defined in: [packages/core/src/system-context.ts:29](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/system-context.ts#L29)

#### Returns

[`SystemExecutionContext`](../interfaces/SystemExecutionContext.md)

---

### withSystemContext()

> **withSystemContext**\<`T`\>(`reason`, `fn`): `Promise`\<`T`\>

Defined in: [packages/core/src/system-context.ts:37](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/system-context.ts#L37)

#### Type Parameters

##### T

`T`

#### Parameters

##### reason

`string`

##### fn

(`context`) => `Promise`\<`T`\>

#### Returns

`Promise`\<`T`\>

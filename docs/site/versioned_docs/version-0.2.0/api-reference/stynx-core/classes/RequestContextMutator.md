[**@stynx-nyx/core**](../index.md)

---

[@stynx-nyx/core](../index.md) / RequestContextMutator

# Class: RequestContextMutator

Defined in: [packages/core/src/request-context.ts:84](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/request-context.ts#L84)

## Constructors

### Constructor

> **new RequestContextMutator**(`cls`): `RequestContextMutator`

Defined in: [packages/core/src/request-context.ts:85](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/request-context.ts#L85)

#### Parameters

##### cls

`ClsService`\<[`CoreClsStore`](../type-aliases/CoreClsStore.md)\>

#### Returns

`RequestContextMutator`

## Methods

### getSystemContext()

> **getSystemContext**(): [`SystemExecutionContext`](../interfaces/SystemExecutionContext.md) \| `undefined`

Defined in: [packages/core/src/request-context.ts:139](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/request-context.ts#L139)

#### Returns

[`SystemExecutionContext`](../interfaces/SystemExecutionContext.md) \| `undefined`

---

### patch()

> **patch**(`patch`): `void`

Defined in: [packages/core/src/request-context.ts:128](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/request-context.ts#L128)

#### Parameters

##### patch

[`RequestContextPatch`](../interfaces/RequestContextPatch.md)

#### Returns

`void`

---

### runWithRequestContext()

> **runWithRequestContext**\<`T`\>(`seed`, `fn`): `T` \| `Promise`\<`T`\>

Defined in: [packages/core/src/request-context.ts:87](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/request-context.ts#L87)

#### Type Parameters

##### T

`T`

#### Parameters

##### seed

[`RequestContextState`](../interfaces/RequestContextState.md)

##### fn

() => `T` \| `Promise`\<`T`\>

#### Returns

`T` \| `Promise`\<`T`\>

---

### runWithSystemContext()

> **runWithSystemContext**\<`T`\>(`reason`, `fn`): `Promise`\<`T`\>

Defined in: [packages/core/src/request-context.ts:99](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/request-context.ts#L99)

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

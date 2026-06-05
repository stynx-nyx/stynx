[**@stynx/core**](../index.md)

---

[@stynx/core](../index.md) / RequestContext

# Class: RequestContext

Defined in: [packages/core/src/request-context.ts:35](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/request-context.ts#L35)

## Constructors

### Constructor

> **new RequestContext**(`cls`): `RequestContext`

Defined in: [packages/core/src/request-context.ts:36](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/request-context.ts#L36)

#### Parameters

##### cls

`ClsService`\<[`CoreClsStore`](../type-aliases/CoreClsStore.md)\>

#### Returns

`RequestContext`

## Accessors

### actorId

#### Get Signature

> **get** **actorId**(): `string` \| `undefined`

Defined in: [packages/core/src/request-context.ts:46](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/request-context.ts#L46)

##### Returns

`string` \| `undefined`

---

### locale

#### Get Signature

> **get** **locale**(): `string` \| `undefined`

Defined in: [packages/core/src/request-context.ts:54](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/request-context.ts#L54)

##### Returns

`string` \| `undefined`

---

### requestId

#### Get Signature

> **get** **requestId**(): `string`

Defined in: [packages/core/src/request-context.ts:38](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/request-context.ts#L38)

##### Returns

`string`

---

### sessionId

#### Get Signature

> **get** **sessionId**(): `string` \| `undefined`

Defined in: [packages/core/src/request-context.ts:50](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/request-context.ts#L50)

##### Returns

`string` \| `undefined`

---

### startedAt

#### Get Signature

> **get** **startedAt**(): `Date`

Defined in: [packages/core/src/request-context.ts:58](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/request-context.ts#L58)

##### Returns

`Date`

---

### tenantId

#### Get Signature

> **get** **tenantId**(): `string` \| `undefined`

Defined in: [packages/core/src/request-context.ts:42](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/request-context.ts#L42)

##### Returns

`string` \| `undefined`

## Methods

### hasActiveContext()

> **hasActiveContext**(): `boolean`

Defined in: [packages/core/src/request-context.ts:62](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/request-context.ts#L62)

#### Returns

`boolean`

---

### snapshot()

> **snapshot**(): `Readonly`\<[`RequestContextState`](../interfaces/RequestContextState.md)\>

Defined in: [packages/core/src/request-context.ts:66](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/request-context.ts#L66)

#### Returns

`Readonly`\<[`RequestContextState`](../interfaces/RequestContextState.md)\>

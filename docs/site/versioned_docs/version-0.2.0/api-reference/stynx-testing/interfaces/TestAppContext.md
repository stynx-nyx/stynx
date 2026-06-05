[**@stynx/testing**](../index.md)

---

[@stynx/testing](../index.md) / TestAppContext

# Interface: TestAppContext

Defined in: [testing/src/types.ts:57](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/testing/src/types.ts#L57)

## Properties

### app

> **app**: `INestApplication`

Defined in: [testing/src/types.ts:58](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/testing/src/types.ts#L58)

---

### cognito?

> `optional` **cognito?**: [`StartedCognitoHandle`](StartedCognitoHandle.md)

Defined in: [testing/src/types.ts:65](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/testing/src/types.ts#L65)

---

### database

> **database**: `Database`

Defined in: [testing/src/types.ts:60](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/testing/src/types.ts#L60)

---

### localstack?

> `optional` **localstack?**: [`StartedLocalstackHandle`](StartedLocalstackHandle.md)

Defined in: [testing/src/types.ts:64](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/testing/src/types.ts#L64)

---

### moduleRef

> **moduleRef**: `TestingModule`

Defined in: [testing/src/types.ts:59](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/testing/src/types.ts#L59)

---

### postgres

> **postgres**: [`StartedPostgresHandle`](StartedPostgresHandle.md)

Defined in: [testing/src/types.ts:62](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/testing/src/types.ts#L62)

---

### redis

> **redis**: [`StartedRedisHandle`](StartedRedisHandle.md)

Defined in: [testing/src/types.ts:63](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/testing/src/types.ts#L63)

---

### requestContextMutator

> **requestContextMutator**: `RequestContextMutator`

Defined in: [testing/src/types.ts:61](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/testing/src/types.ts#L61)

## Methods

### adminClient()

> **adminClient**(): `Promise`\<`Client`\>

Defined in: [testing/src/types.ts:66](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/testing/src/types.ts#L66)

#### Returns

`Promise`\<`Client`\>

---

### teardown()

> **teardown**(): `Promise`\<`void`\>

Defined in: [testing/src/types.ts:68](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/testing/src/types.ts#L68)

#### Returns

`Promise`\<`void`\>

---

### tx()

> **tx**\<`T`\>(`fn`): `Promise`\<`T`\>

Defined in: [testing/src/types.ts:67](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/testing/src/types.ts#L67)

#### Type Parameters

##### T

`T`

#### Parameters

##### fn

(`trx`) => `Promise`\<`T`\>

#### Returns

`Promise`\<`T`\>

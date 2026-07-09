[**@stynx-nyx/data**](../index.md)

---

[@stynx-nyx/data](../index.md) / StynxPoolRegistry

# Class: StynxPoolRegistry

Defined in: [packages/data/src/pools.ts:88](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/pools.ts#L88)

PostgreSQL pool registry exports.

## Implements

- `OnModuleInit`
- `OnModuleDestroy`

## Constructors

### Constructor

> **new StynxPoolRegistry**(`options`, `secretLoader`): `StynxPoolRegistry`

Defined in: [packages/data/src/pools.ts:92](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/pools.ts#L92)

#### Parameters

##### options

[`StynxDataModuleOptions`](../interfaces/StynxDataModuleOptions.md)

##### secretLoader

`SecretLoader`

#### Returns

`StynxPoolRegistry`

## Properties

### pools

> `readonly` **pools**: `Record`\<[`StynxDataRole`](../type-aliases/StynxDataRole.md), `Pool`\>

Defined in: [packages/data/src/pools.ts:89](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/pools.ts#L89)

## Methods

### get()

> **get**(`role`, `replica?`): `Pool`

Defined in: [packages/data/src/pools.ts:122](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/pools.ts#L122)

#### Parameters

##### role

[`StynxDataRole`](../type-aliases/StynxDataRole.md)

##### replica?

`boolean` = `false`

#### Returns

`Pool`

---

### onModuleDestroy()

> **onModuleDestroy**(): `Promise`\<`void`\>

Defined in: [packages/data/src/pools.ts:129](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/pools.ts#L129)

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnModuleDestroy.onModuleDestroy`

---

### onModuleInit()

> **onModuleInit**(): `Promise`\<`void`\>

Defined in: [packages/data/src/pools.ts:100](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/pools.ts#L100)

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnModuleInit.onModuleInit`

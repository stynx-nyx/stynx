[**@stynx-nyx/core**](../index.md)

---

[@stynx-nyx/core](../index.md) / SecretLoader

# Class: SecretLoader

Defined in: [packages/core/src/secret-loader.ts:24](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/secret-loader.ts#L24)

## Constructors

### Constructor

> **new SecretLoader**(`options?`): `SecretLoader`

Defined in: [packages/core/src/secret-loader.ts:29](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/secret-loader.ts#L29)

#### Parameters

##### options?

[`StynxCoreModuleOptions`](../interfaces/StynxCoreModuleOptions.md)\<`ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>\>

#### Returns

`SecretLoader`

## Methods

### getSecretString()

> **getSecretString**(`secretId`, `forceRefresh?`): `Promise`\<`string`\>

Defined in: [packages/core/src/secret-loader.ts:43](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/secret-loader.ts#L43)

#### Parameters

##### secretId

`string`

##### forceRefresh?

`boolean` = `false`

#### Returns

`Promise`\<`string`\>

---

### invalidate()

> **invalidate**(`secretId`): `void`

Defined in: [packages/core/src/secret-loader.ts:72](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/secret-loader.ts#L72)

#### Parameters

##### secretId

`string`

#### Returns

`void`

---

### withConnectionErrorRefresh()

> **withConnectionErrorRefresh**\<`T`\>(`secretId`, `run`): `Promise`\<`T`\>

Defined in: [packages/core/src/secret-loader.ts:76](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/secret-loader.ts#L76)

#### Type Parameters

##### T

`T`

#### Parameters

##### secretId

`string`

##### run

(`secret`) => `Promise`\<`T`\>

#### Returns

`Promise`\<`T`\>

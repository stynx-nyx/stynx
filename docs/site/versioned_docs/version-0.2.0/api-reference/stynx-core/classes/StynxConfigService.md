[**@stynx-nyx/core**](../index.md)

---

[@stynx-nyx/core](../index.md) / StynxConfigService

# Class: StynxConfigService\<TConfig\>

Defined in: [packages/core/src/config.ts:134](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/config.ts#L134)

## Type Parameters

### TConfig

`TConfig` _extends_ `Record`\<`string`, `unknown`\> = `Record`\<`string`, `unknown`\>

## Constructors

### Constructor

> **new StynxConfigService**\<`TConfig`\>(`config`, `options?`): `StynxConfigService`\<`TConfig`\>

Defined in: [packages/core/src/config.ts:135](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/config.ts#L135)

#### Parameters

##### config

`TConfig`

##### options?

[`StynxCoreModuleOptions`](../interfaces/StynxCoreModuleOptions.md)\<`ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>\>

#### Returns

`StynxConfigService`\<`TConfig`\>

## Accessors

### appName

#### Get Signature

> **get** **appName**(): `string` \| `undefined`

Defined in: [packages/core/src/config.ts:147](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/config.ts#L147)

##### Returns

`string` \| `undefined`

## Methods

### get()

> **get**\<`K`\>(`key`): `TConfig`\[`K`\]

Defined in: [packages/core/src/config.ts:143](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/config.ts#L143)

#### Type Parameters

##### K

`K` _extends_ `string` \| `number` \| `symbol`

#### Parameters

##### key

`K`

#### Returns

`TConfig`\[`K`\]

---

### snapshot()

> **snapshot**(): `Readonly`\<`TConfig`\>

Defined in: [packages/core/src/config.ts:151](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/config.ts#L151)

#### Returns

`Readonly`\<`TConfig`\>

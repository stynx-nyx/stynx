[**@stynx-nyx/core**](../index.md)

---

[@stynx-nyx/core](../index.md) / StynxCoreModuleAsyncOptions

# Interface: StynxCoreModuleAsyncOptions\<TSchema\>

Defined in: [packages/core/src/config.ts:37](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/config.ts#L37)

## Type Parameters

### TSchema

`TSchema` _extends_ `ZodTypeAny` = `ZodTypeAny`

## Properties

### imports?

> `optional` **imports?**: `unknown`[]

Defined in: [packages/core/src/config.ts:38](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/config.ts#L38)

---

### inject?

> `optional` **inject?**: `unknown`[]

Defined in: [packages/core/src/config.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/config.ts#L39)

---

### useFactory

> **useFactory**: (...`args`) => [`StynxCoreModuleOptions`](StynxCoreModuleOptions.md)\<`TSchema`\> \| `Promise`\<[`StynxCoreModuleOptions`](StynxCoreModuleOptions.md)\<`TSchema`\>\>

Defined in: [packages/core/src/config.ts:40](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/config.ts#L40)

#### Parameters

##### args

...`unknown`[]

#### Returns

[`StynxCoreModuleOptions`](StynxCoreModuleOptions.md)\<`TSchema`\> \| `Promise`\<[`StynxCoreModuleOptions`](StynxCoreModuleOptions.md)\<`TSchema`\>\>

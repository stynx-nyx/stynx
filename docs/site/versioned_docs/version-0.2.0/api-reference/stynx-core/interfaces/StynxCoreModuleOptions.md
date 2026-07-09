[**@stynx-nyx/core**](../index.md)

---

[@stynx-nyx/core](../index.md) / StynxCoreModuleOptions

# Interface: StynxCoreModuleOptions\<TSchema\>

Defined in: [packages/core/src/config.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/config.ts#L13)

## Type Parameters

### TSchema

`TSchema` _extends_ `ZodTypeAny` = `ZodTypeAny`

## Properties

### appName

> **appName**: `string`

Defined in: [packages/core/src/config.ts:14](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/config.ts#L14)

---

### configMetadata?

> `optional` **configMetadata?**: `Partial`\<`Record`\<`string`, [`ConfigKeyMetadata`](ConfigKeyMetadata.md)\>\>

Defined in: [packages/core/src/config.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/config.ts#L17)

---

### defaults?

> `optional` **defaults?**: `Partial`\<`input`\<`TSchema`\>\>

Defined in: [packages/core/src/config.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/config.ts#L18)

---

### envName?

> `optional` **envName?**: `string`

Defined in: [packages/core/src/config.ts:15](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/config.ts#L15)

---

### schema

> **schema**: `TSchema`

Defined in: [packages/core/src/config.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/config.ts#L16)

---

### secretCacheTtlMs?

> `optional` **secretCacheTtlMs?**: `number`

Defined in: [packages/core/src/config.ts:20](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/config.ts#L20)

---

### ssm?

> `optional` **ssm?**: [`StynxSsmOptions`](StynxSsmOptions.md)

Defined in: [packages/core/src/config.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/config.ts#L19)

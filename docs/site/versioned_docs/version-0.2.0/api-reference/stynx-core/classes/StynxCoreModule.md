[**@stynx/core**](../index.md)

---

[@stynx/core](../index.md) / StynxCoreModule

# Class: StynxCoreModule

Defined in: [packages/core/src/core.module.ts:46](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/core.module.ts#L46)

## Constructors

### Constructor

> **new StynxCoreModule**(): `StynxCoreModule`

#### Returns

`StynxCoreModule`

## Methods

### forRoot()

> `static` **forRoot**\<`TSchema`\>(`options`): `DynamicModule`

Defined in: [packages/core/src/core.module.ts:47](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/core.module.ts#L47)

#### Type Parameters

##### TSchema

`TSchema` _extends_ `ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>

#### Parameters

##### options

[`StynxCoreModuleOptions`](../interfaces/StynxCoreModuleOptions.md)\<`TSchema`\>

#### Returns

`DynamicModule`

---

### forRootAsync()

> `static` **forRootAsync**\<`TSchema`\>(`options`): `DynamicModule`

Defined in: [packages/core/src/core.module.ts:56](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/core.module.ts#L56)

#### Type Parameters

##### TSchema

`TSchema` _extends_ `ZodType`\<`unknown`, `unknown`, `$ZodTypeInternals`\<`unknown`, `unknown`\>\>

#### Parameters

##### options

[`StynxCoreModuleAsyncOptions`](../interfaces/StynxCoreModuleAsyncOptions.md)\<`TSchema`\>

#### Returns

`DynamicModule`

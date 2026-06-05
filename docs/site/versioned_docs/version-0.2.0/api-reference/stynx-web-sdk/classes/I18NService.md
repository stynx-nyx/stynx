[**@stynx-web/sdk**](../index.md)

---

[@stynx-web/sdk](../index.md) / I18NService

# Class: I18NService

Defined in: [packages-web/sdk/src/generated/services/I18NService.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/I18NService.ts#L9)

## Constructors

### Constructor

> **new I18NService**(`httpRequest`): `I18NService`

Defined in: [packages-web/sdk/src/generated/services/I18NService.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/I18NService.ts#L10)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`I18NService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/I18NService.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/I18NService.ts#L10)

## Methods

### i18NGetTenancyI18NOverridesListOverrides()

> **i18NGetTenancyI18NOverridesListOverrides**(): [`CancelablePromise`](CancelablePromise.md)\<`Record`\<`string`, `string`\> \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/I18NService.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/I18NService.ts#L16)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<`Record`\<`string`, `string`\> \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

string OK

#### Throws

ApiError

---

### i18NPutTenancyI18NOverridesUpdateOverrides()

> **i18NPutTenancyI18NOverridesUpdateOverrides**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<`Record`\<`string`, `string`\> \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/I18NService.ts:33](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/I18NService.ts#L33)

#### Parameters

##### \_\_namedParameters

###### requestBody

[`TenantOverrideUpdateInput`](../type-aliases/TenantOverrideUpdateInput.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<`Record`\<`string`, `string`\> \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

string OK

#### Throws

ApiError

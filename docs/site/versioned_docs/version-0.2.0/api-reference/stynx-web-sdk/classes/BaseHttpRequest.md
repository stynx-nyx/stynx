[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / BaseHttpRequest

# Abstract Class: BaseHttpRequest

Defined in: [packages-web/sdk/src/generated/core/BaseHttpRequest.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/core/BaseHttpRequest.ts#L9)

## Constructors

### Constructor

> **new BaseHttpRequest**(`config`): `BaseHttpRequest`

Defined in: [packages-web/sdk/src/generated/core/BaseHttpRequest.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/core/BaseHttpRequest.ts#L11)

#### Parameters

##### config

[`OpenAPIConfig`](../type-aliases/OpenAPIConfig.md)

#### Returns

`BaseHttpRequest`

## Properties

### config

> `readonly` **config**: [`OpenAPIConfig`](../type-aliases/OpenAPIConfig.md)

Defined in: [packages-web/sdk/src/generated/core/BaseHttpRequest.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/core/BaseHttpRequest.ts#L11)

## Methods

### request()

> `abstract` **request**\<`T`\>(`options`): [`CancelablePromise`](CancelablePromise.md)\<`T`\>

Defined in: [packages-web/sdk/src/generated/core/BaseHttpRequest.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/core/BaseHttpRequest.ts#L13)

#### Type Parameters

##### T

`T`

#### Parameters

##### options

`ApiRequestOptions`

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<`T`\>

[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / StynxApiClient

# Class: StynxApiClient

Defined in: [packages-web/sdk/src/api-client.ts:49](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/api-client.ts#L49)

## Constructors

### Constructor

> **new StynxApiClient**(`options`): `StynxApiClient`

Defined in: [packages-web/sdk/src/api-client.ts:52](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/api-client.ts#L52)

#### Parameters

##### options

[`StynxApiClientOptions`](../interfaces/StynxApiClientOptions.md)

#### Returns

`StynxApiClient`

## Methods

### delete()

> **delete**\<`T`\>(`path`, `requestOptions?`): `Promise`\<`T`\>

Defined in: [packages-web/sdk/src/api-client.ts:64](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/api-client.ts#L64)

#### Type Parameters

##### T

`T`

#### Parameters

##### path

`string`

##### requestOptions?

[`ApiRequestOptions`](../interfaces/ApiRequestOptions.md)

#### Returns

`Promise`\<`T`\>

---

### get()

> **get**\<`T`\>(`path`, `requestOptions?`): `Promise`\<`T`\>

Defined in: [packages-web/sdk/src/api-client.ts:56](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/api-client.ts#L56)

#### Type Parameters

##### T

`T`

#### Parameters

##### path

`string`

##### requestOptions?

[`ApiRequestOptions`](../interfaces/ApiRequestOptions.md)

#### Returns

`Promise`\<`T`\>

---

### post()

> **post**\<`T`\>(`path`, `body`, `requestOptions?`): `Promise`\<`T`\>

Defined in: [packages-web/sdk/src/api-client.ts:60](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/api-client.ts#L60)

#### Type Parameters

##### T

`T`

#### Parameters

##### path

`string`

##### body

`unknown`

##### requestOptions?

[`ApiRequestOptions`](../interfaces/ApiRequestOptions.md)

#### Returns

`Promise`\<`T`\>

---

### request()

> **request**\<`T`\>(`method`, `path`, `body?`, `requestOptions?`): `Promise`\<`T`\>

Defined in: [packages-web/sdk/src/api-client.ts:68](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/api-client.ts#L68)

#### Type Parameters

##### T

`T`

#### Parameters

##### method

`string`

##### path

`string`

##### body?

`unknown`

##### requestOptions?

[`ApiRequestOptions`](../interfaces/ApiRequestOptions.md) = `{}`

#### Returns

`Promise`\<`T`\>

[**@stynx-web/sdk**](../index.md)

---

[@stynx-web/sdk](../index.md) / StynxSdkClient

# Class: StynxSdkClient

Defined in: [packages-web/sdk/src/client.ts:4](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/client.ts#L4)

## Constructors

### Constructor

> **new StynxSdkClient**(`options`): `StynxSdkClient`

Defined in: [packages-web/sdk/src/client.ts:7](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/client.ts#L7)

#### Parameters

##### options

[`StynxHttpTransportOptions`](../interfaces/StynxHttpTransportOptions.md)

#### Returns

`StynxSdkClient`

## Properties

### transport

> `readonly` **transport**: [`StynxHttpTransport`](StynxHttpTransport.md)

Defined in: [packages-web/sdk/src/client.ts:5](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/client.ts#L5)

## Methods

### delete()

> **delete**\<`T`\>(`path`, `options?`): `Promise`\<`T`\>

Defined in: [packages-web/sdk/src/client.ts:46](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/client.ts#L46)

#### Type Parameters

##### T

`T`

#### Parameters

##### path

`string`

##### options?

[`ApiRequestOptions`](../interfaces/ApiRequestOptions.md) = `{}`

#### Returns

`Promise`\<`T`\>

---

### get()

> **get**\<`T`\>(`path`, `options?`): `Promise`\<`T`\>

Defined in: [packages-web/sdk/src/client.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/client.ts#L11)

#### Type Parameters

##### T

`T`

#### Parameters

##### path

`string`

##### options?

[`ApiRequestOptions`](../interfaces/ApiRequestOptions.md) = `{}`

#### Returns

`Promise`\<`T`\>

---

### patch()

> **patch**\<`T`\>(`path`, `body`, `options?`): `Promise`\<`T`\>

Defined in: [packages-web/sdk/src/client.ts:37](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/client.ts#L37)

#### Type Parameters

##### T

`T`

#### Parameters

##### path

`string`

##### body

`unknown`

##### options?

[`ApiRequestOptions`](../interfaces/ApiRequestOptions.md) = `{}`

#### Returns

`Promise`\<`T`\>

---

### post()

> **post**\<`T`\>(`path`, `body`, `options?`): `Promise`\<`T`\>

Defined in: [packages-web/sdk/src/client.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/client.ts#L19)

#### Type Parameters

##### T

`T`

#### Parameters

##### path

`string`

##### body

`unknown`

##### options?

[`ApiRequestOptions`](../interfaces/ApiRequestOptions.md) = `{}`

#### Returns

`Promise`\<`T`\>

---

### put()

> **put**\<`T`\>(`path`, `body`, `options?`): `Promise`\<`T`\>

Defined in: [packages-web/sdk/src/client.ts:28](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/client.ts#L28)

#### Type Parameters

##### T

`T`

#### Parameters

##### path

`string`

##### body

`unknown`

##### options?

[`ApiRequestOptions`](../interfaces/ApiRequestOptions.md) = `{}`

#### Returns

`Promise`\<`T`\>

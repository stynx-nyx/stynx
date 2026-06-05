[**@stynx-web/sdk**](../index.md)

---

[@stynx-web/sdk](../index.md) / StynxApiClientOptions

# Interface: StynxApiClientOptions

Defined in: [packages-web/sdk/src/api-client.ts:14](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/api-client.ts#L14)

## Properties

### baseUrl

> **baseUrl**: `string`

Defined in: [packages-web/sdk/src/api-client.ts:15](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/api-client.ts#L15)

---

### defaultHeaders?

> `optional` **defaultHeaders?**: `Record`\<`string`, `string`\>

Defined in: [packages-web/sdk/src/api-client.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/api-client.ts#L19)

---

### fetchFn

> **fetchFn**: [`FetchLike`](../type-aliases/FetchLike.md)

Defined in: [packages-web/sdk/src/api-client.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/api-client.ts#L16)

---

### sessionManager?

> `optional` **sessionManager?**: [`FrontendSessionManager`](../classes/FrontendSessionManager.md)

Defined in: [packages-web/sdk/src/api-client.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/api-client.ts#L17)

---

### tenantResolver?

> `optional` **tenantResolver?**: () => `string` \| `null`

Defined in: [packages-web/sdk/src/api-client.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/api-client.ts#L18)

#### Returns

`string` \| `null`

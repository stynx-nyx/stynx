[**@stynx-nyx/signature**](../index.md)

---

[@stynx-nyx/signature](../index.md) / HttpSignatureProviderOptions

# Interface: HttpSignatureProviderOptions

Defined in: [packages/signature/src/types.ts:157](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L157)

## Properties

### baseUrl?

> `optional` **baseUrl?**: `string`

Defined in: [packages/signature/src/types.ts:158](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L158)

---

### crlUrl?

> `optional` **crlUrl?**: `string`

Defined in: [packages/signature/src/types.ts:162](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L162)

---

### fetch?

> `optional` **fetch?**: (`input`, `init?`) => `Promise`\<`Response`\>

Defined in: [packages/signature/src/types.ts:165](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L165)

#### Parameters

##### input

`string` \| `URL` \| `Request`

##### init?

`RequestInit`

#### Returns

`Promise`\<`Response`\>

---

### headers?

> `optional` **headers?**: `Record`\<`string`, `string`\>

Defined in: [packages/signature/src/types.ts:161](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L161)

---

### pathPrefix?

> `optional` **pathPrefix?**: `string`

Defined in: [packages/signature/src/types.ts:159](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L159)

---

### retryPolicy?

> `optional` **retryPolicy?**: `RetryPolicy`

Defined in: [packages/signature/src/types.ts:163](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L163)

---

### telemetry?

> `optional` **telemetry?**: `IntegrationTelemetry`

Defined in: [packages/signature/src/types.ts:164](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L164)

---

### timeoutMs?

> `optional` **timeoutMs?**: `number`

Defined in: [packages/signature/src/types.ts:160](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/types.ts#L160)

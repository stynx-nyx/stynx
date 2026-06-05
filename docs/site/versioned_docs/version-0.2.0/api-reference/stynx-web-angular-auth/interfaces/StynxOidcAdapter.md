[**@stynx-web/angular-auth**](../index.md)

---

[@stynx-web/angular-auth](../index.md) / StynxOidcAdapter

# Interface: StynxOidcAdapter

Defined in: [types.ts:70](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L70)

## Methods

### authorize()

> **authorize**(`authOptions?`): `void`

Defined in: [types.ts:72](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L72)

#### Parameters

##### authOptions?

`AuthOptions`

#### Returns

`void`

---

### checkAuth()

> **checkAuth**(`url?`): `Promise`\<`LoginResponse`\>

Defined in: [types.ts:71](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L71)

#### Parameters

##### url?

`string`

#### Returns

`Promise`\<`LoginResponse`\>

---

### forceRefreshSession()

> **forceRefreshSession**(): `Promise`\<`LoginResponse`\>

Defined in: [types.ts:74](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L74)

#### Returns

`Promise`\<`LoginResponse`\>

---

### getHostedActionLink()?

> `optional` **getHostedActionLink**(`action`, `context?`): [`StynxHostedAuthActionLink`](StynxHostedAuthActionLink.md) \| `null`

Defined in: [types.ts:75](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L75)

#### Parameters

##### action

[`StynxHostedAuthAction`](../type-aliases/StynxHostedAuthAction.md)

##### context?

`Partial`\<[`StynxHostedAuthActionContext`](StynxHostedAuthActionContext.md)\>

#### Returns

[`StynxHostedAuthActionLink`](StynxHostedAuthActionLink.md) \| `null`

---

### logoff()

> **logoff**(): `Promise`\<`void`\>

Defined in: [types.ts:73](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L73)

#### Returns

`Promise`\<`void`\>

---

### openHostedAction()?

> `optional` **openHostedAction**(`action`, `context?`): `void`

Defined in: [types.ts:79](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/types.ts#L79)

#### Parameters

##### action

[`StynxHostedAuthAction`](../type-aliases/StynxHostedAuthAction.md)

##### context?

`Partial`\<[`StynxHostedAuthActionContext`](StynxHostedAuthActionContext.md)\>

#### Returns

`void`

[**@stynx-nyx/angular-auth**](../index.md)

---

[@stynx-nyx/angular-auth](../index.md) / OidcClientAdapter

# Class: OidcClientAdapter

Defined in: [oidc-client.adapter.ts:54](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/oidc-client.adapter.ts#L54)

## Implements

- [`StynxOidcAdapter`](../interfaces/StynxOidcAdapter.md)

## Constructors

### Constructor

> **new OidcClientAdapter**(): `OidcClientAdapter`

#### Returns

`OidcClientAdapter`

## Methods

### authorize()

> **authorize**(`authOptions?`): `void`

Defined in: [oidc-client.adapter.ts:62](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/oidc-client.adapter.ts#L62)

#### Parameters

##### authOptions?

`AuthOptions`

#### Returns

`void`

#### Implementation of

[`StynxOidcAdapter`](../interfaces/StynxOidcAdapter.md).[`authorize`](../interfaces/StynxOidcAdapter.md#authorize)

---

### checkAuth()

> **checkAuth**(`url?`): `Promise`\<`LoginResponse`\>

Defined in: [oidc-client.adapter.ts:58](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/oidc-client.adapter.ts#L58)

#### Parameters

##### url?

`string`

#### Returns

`Promise`\<`LoginResponse`\>

#### Implementation of

[`StynxOidcAdapter`](../interfaces/StynxOidcAdapter.md).[`checkAuth`](../interfaces/StynxOidcAdapter.md#checkauth)

---

### forceRefreshSession()

> **forceRefreshSession**(): `Promise`\<`LoginResponse`\>

Defined in: [oidc-client.adapter.ts:70](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/oidc-client.adapter.ts#L70)

#### Returns

`Promise`\<`LoginResponse`\>

#### Implementation of

[`StynxOidcAdapter`](../interfaces/StynxOidcAdapter.md).[`forceRefreshSession`](../interfaces/StynxOidcAdapter.md#forcerefreshsession)

---

### getHostedActionLink()

> **getHostedActionLink**(`action`, `context?`): [`StynxHostedAuthActionLink`](../interfaces/StynxHostedAuthActionLink.md) \| `null`

Defined in: [oidc-client.adapter.ts:74](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/oidc-client.adapter.ts#L74)

#### Parameters

##### action

[`StynxHostedAuthAction`](../type-aliases/StynxHostedAuthAction.md)

##### context?

`Partial`\<[`StynxHostedAuthActionContext`](../interfaces/StynxHostedAuthActionContext.md)\> = `{}`

#### Returns

[`StynxHostedAuthActionLink`](../interfaces/StynxHostedAuthActionLink.md) \| `null`

#### Implementation of

[`StynxOidcAdapter`](../interfaces/StynxOidcAdapter.md).[`getHostedActionLink`](../interfaces/StynxOidcAdapter.md#gethostedactionlink)

---

### logoff()

> **logoff**(): `Promise`\<`void`\>

Defined in: [oidc-client.adapter.ts:66](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/oidc-client.adapter.ts#L66)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`StynxOidcAdapter`](../interfaces/StynxOidcAdapter.md).[`logoff`](../interfaces/StynxOidcAdapter.md#logoff)

---

### openHostedAction()

> **openHostedAction**(`action`, `context?`): `void`

Defined in: [oidc-client.adapter.ts:109](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/oidc-client.adapter.ts#L109)

#### Parameters

##### action

[`StynxHostedAuthAction`](../type-aliases/StynxHostedAuthAction.md)

##### context?

`Partial`\<[`StynxHostedAuthActionContext`](../interfaces/StynxHostedAuthActionContext.md)\> = `{}`

#### Returns

`void`

#### Implementation of

[`StynxOidcAdapter`](../interfaces/StynxOidcAdapter.md).[`openHostedAction`](../interfaces/StynxOidcAdapter.md#openhostedaction)

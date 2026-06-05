[**@stynx-web/angular-auth**](../index.md)

---

[@stynx-web/angular-auth](../index.md) / StynxSessionService

# Class: StynxSessionService

Defined in: [session.service.ts:25](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/session.service.ts#L25)

## Implements

- `AuthProvider`

## Constructors

### Constructor

> **new StynxSessionService**(): `StynxSessionService`

#### Returns

`StynxSessionService`

## Properties

### active

> `readonly` **active**: `Signal`\<`boolean`\>

Defined in: [session.service.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/session.service.ts#L39)

---

### ~~active$~~

> `readonly` **active$**: `Observable`\<[`StynxSessionState`](../interfaces/StynxSessionState.md)\>

Defined in: [session.service.ts:43](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/session.service.ts#L43)

#### Deprecated

since: 1.x — use toObservable(this.state) or the signal directly.

---

### state

> `readonly` **state**: `Signal`\<[`StynxSessionState`](../interfaces/StynxSessionState.md)\>

Defined in: [session.service.ts:38](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/session.service.ts#L38)

## Methods

### completeLogin()

> **completeLogin**(`url?`): `Promise`\<[`StynxSessionState`](../interfaces/StynxSessionState.md)\>

Defined in: [session.service.ts:56](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/session.service.ts#L56)

#### Parameters

##### url?

`string`

#### Returns

`Promise`\<[`StynxSessionState`](../interfaces/StynxSessionState.md)\>

---

### getAccessToken()

> **getAccessToken**(): `Promise`\<`string` \| `null`\>

Defined in: [session.service.ts:84](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/session.service.ts#L84)

#### Returns

`Promise`\<`string` \| `null`\>

#### Implementation of

`AuthProvider.getAccessToken`

---

### hasAllPermissions()

> **hasAllPermissions**(`required`): `boolean`

Defined in: [session.service.ts:117](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/session.service.ts#L117)

#### Parameters

##### required

`string`[]

#### Returns

`boolean`

---

### hasAnyPermissions()

> **hasAnyPermissions**(`required`): `boolean`

Defined in: [session.service.ts:122](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/session.service.ts#L122)

#### Parameters

##### required

`string`[]

#### Returns

`boolean`

---

### login()

> **login**(): `void`

Defined in: [session.service.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/session.service.ts#L48)

#### Returns

`void`

---

### loginRedirect()

> **loginRedirect**(): `void`

Defined in: [session.service.ts:52](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/session.service.ts#L52)

#### Returns

`void`

#### Implementation of

`AuthProvider.loginRedirect`

---

### logout()

> **logout**(): `Promise`\<`void`\>

Defined in: [session.service.ts:75](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/session.service.ts#L75)

#### Returns

`Promise`\<`void`\>

---

### onAuthFailure()

> **onAuthFailure**(): `Promise`\<`void`\>

Defined in: [session.service.ts:103](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/session.service.ts#L103)

#### Returns

`Promise`\<`void`\>

#### Implementation of

`AuthProvider.onAuthFailure`

---

### refresh()

> **refresh**(): `Promise`\<`string` \| `null`\>

Defined in: [session.service.ts:88](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/session.service.ts#L88)

#### Returns

`Promise`\<`string` \| `null`\>

#### Implementation of

`AuthProvider.refresh`

---

### snapshot()

> **snapshot**(): [`StynxSessionState`](../interfaces/StynxSessionState.md)

Defined in: [session.service.ts:127](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/session.service.ts#L127)

#### Returns

[`StynxSessionState`](../interfaces/StynxSessionState.md)

---

### switchTenant()

> **switchTenant**(`tenantId`): `Promise`\<[`StynxSessionState`](../interfaces/StynxSessionState.md)\>

Defined in: [session.service.ts:107](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-auth/src/session.service.ts#L107)

#### Parameters

##### tenantId

`string`

#### Returns

`Promise`\<[`StynxSessionState`](../interfaces/StynxSessionState.md)\>

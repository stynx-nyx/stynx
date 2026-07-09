[**@stynx-nyx/sessions**](../index.md)

---

[@stynx-nyx/sessions](../index.md) / SessionService

# Class: SessionService

Defined in: [packages/sessions/src/session.service.ts:46](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/session.service.ts#L46)

## Constructors

### Constructor

> **new SessionService**(`options`, `store`, `signingService`, `mirror`): `SessionService`

Defined in: [packages/sessions/src/session.service.ts:47](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/session.service.ts#L47)

#### Parameters

##### options

[`ResolvedStynxSessionsModuleOptions`](../interfaces/ResolvedStynxSessionsModuleOptions.md)

##### store

[`SessionStore`](../interfaces/SessionStore.md)

##### signingService

[`SessionJwtSigningService`](SessionJwtSigningService.md)

##### mirror

[`SessionMirror`](../interfaces/SessionMirror.md)

#### Returns

`SessionService`

## Methods

### create()

> **create**(`userId`, `tenantId`, `cognitoSub`, `deviceMeta?`, `metadata?`): `Promise`\<[`SessionBundle`](../interfaces/SessionBundle.md)\>

Defined in: [packages/sessions/src/session.service.ts:57](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/session.service.ts#L57)

#### Parameters

##### userId

`string`

##### tenantId

`string`

##### cognitoSub

`string`

##### deviceMeta?

[`DeviceMetadata`](../interfaces/DeviceMetadata.md) = `{}`

##### metadata?

[`SessionCreateMetadata`](../interfaces/SessionCreateMetadata.md) = `{}`

#### Returns

`Promise`\<[`SessionBundle`](../interfaces/SessionBundle.md)\>

---

### exchange()

> **exchange**(`options`): `Promise`\<[`SessionExchangeResult`](../interfaces/SessionExchangeResult.md)\>

Defined in: [packages/sessions/src/session.service.ts:208](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/session.service.ts#L208)

#### Parameters

##### options

[`SessionExchangeOptions`](../interfaces/SessionExchangeOptions.md)

#### Returns

`Promise`\<[`SessionExchangeResult`](../interfaces/SessionExchangeResult.md)\>

---

### get()

> **get**(`sid`): `Promise`\<[`SessionRecord`](../interfaces/SessionRecord.md) \| `null`\>

Defined in: [packages/sessions/src/session.service.ts:176](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/session.service.ts#L176)

#### Parameters

##### sid

`string`

#### Returns

`Promise`\<[`SessionRecord`](../interfaces/SessionRecord.md) \| `null`\>

---

### refresh()

> **refresh**(`refreshToken`): `Promise`\<[`SessionBundle`](../interfaces/SessionBundle.md)\>

Defined in: [packages/sessions/src/session.service.ts:102](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/session.service.ts#L102)

#### Parameters

##### refreshToken

`string`

#### Returns

`Promise`\<[`SessionBundle`](../interfaces/SessionBundle.md)\>

---

### revoke()

> **revoke**(`sid`): `Promise`\<`boolean`\>

Defined in: [packages/sessions/src/session.service.ts:140](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/session.service.ts#L140)

#### Parameters

##### sid

`string`

#### Returns

`Promise`\<`boolean`\>

---

### revokeAllForTenant()

> **revokeAllForTenant**(`tenantId`): `Promise`\<`number`\>

Defined in: [packages/sessions/src/session.service.ts:161](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/session.service.ts#L161)

#### Parameters

##### tenantId

`string`

#### Returns

`Promise`\<`number`\>

---

### revokeAllForUser()

> **revokeAllForUser**(`userId`): `Promise`\<`number`\>

Defined in: [packages/sessions/src/session.service.ts:145](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/session.service.ts#L145)

#### Parameters

##### userId

`string`

#### Returns

`Promise`\<`number`\>

---

### touch()

> **touch**(`sid`): `Promise`\<[`SessionRecord`](../interfaces/SessionRecord.md) \| `null`\>

Defined in: [packages/sessions/src/session.service.ts:194](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/session.service.ts#L194)

#### Parameters

##### sid

`string`

#### Returns

`Promise`\<[`SessionRecord`](../interfaces/SessionRecord.md) \| `null`\>

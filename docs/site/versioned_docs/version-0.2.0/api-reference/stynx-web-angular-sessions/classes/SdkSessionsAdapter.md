[**@stynx-web/angular-sessions**](../index.md)

---

[@stynx-web/angular-sessions](../index.md) / SdkSessionsAdapter

# Class: SdkSessionsAdapter

Defined in: [sdk-sessions.adapter.ts:28](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-sessions/src/sdk-sessions.adapter.ts#L28)

## Implements

- [`StynxSessionsAdapter`](../interfaces/StynxSessionsAdapter.md)

## Constructors

### Constructor

> **new SdkSessionsAdapter**(): `SdkSessionsAdapter`

#### Returns

`SdkSessionsAdapter`

## Methods

### list()

> **list**(): `Observable`\<[`StynxActiveSession`](../interfaces/StynxActiveSession.md)[]\>

Defined in: [sdk-sessions.adapter.ts:32](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-sessions/src/sdk-sessions.adapter.ts#L32)

#### Returns

`Observable`\<[`StynxActiveSession`](../interfaces/StynxActiveSession.md)[]\>

#### Implementation of

[`StynxSessionsAdapter`](../interfaces/StynxSessionsAdapter.md).[`list`](../interfaces/StynxSessionsAdapter.md#list)

---

### revoke()

> **revoke**(`sid`): `Observable`\<`void`\>

Defined in: [sdk-sessions.adapter.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-sessions/src/sdk-sessions.adapter.ts#L39)

#### Parameters

##### sid

`string`

#### Returns

`Observable`\<`void`\>

#### Implementation of

[`StynxSessionsAdapter`](../interfaces/StynxSessionsAdapter.md).[`revoke`](../interfaces/StynxSessionsAdapter.md#revoke)

---

### revokeOthers()

> **revokeOthers**(): `Observable`\<`void`\>

Defined in: [sdk-sessions.adapter.ts:43](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-sessions/src/sdk-sessions.adapter.ts#L43)

#### Returns

`Observable`\<`void`\>

#### Implementation of

[`StynxSessionsAdapter`](../interfaces/StynxSessionsAdapter.md).[`revokeOthers`](../interfaces/StynxSessionsAdapter.md#revokeothers)

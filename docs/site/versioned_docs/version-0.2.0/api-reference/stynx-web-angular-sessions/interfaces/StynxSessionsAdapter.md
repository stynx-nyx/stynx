[**@stynx-web/angular-sessions**](../index.md)

---

[@stynx-web/angular-sessions](../index.md) / StynxSessionsAdapter

# Interface: StynxSessionsAdapter

Defined in: [types.ts:24](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-sessions/src/types.ts#L24)

## Methods

### list()

> **list**(): [`StynxSessionsAdapterResult`](../type-aliases/StynxSessionsAdapterResult.md)\<[`StynxActiveSession`](StynxActiveSession.md)[]\>

Defined in: [types.ts:25](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-sessions/src/types.ts#L25)

#### Returns

[`StynxSessionsAdapterResult`](../type-aliases/StynxSessionsAdapterResult.md)\<[`StynxActiveSession`](StynxActiveSession.md)[]\>

---

### revoke()

> **revoke**(`sid`): [`StynxSessionsAdapterResult`](../type-aliases/StynxSessionsAdapterResult.md)\<`void`\>

Defined in: [types.ts:26](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-sessions/src/types.ts#L26)

#### Parameters

##### sid

`string`

#### Returns

[`StynxSessionsAdapterResult`](../type-aliases/StynxSessionsAdapterResult.md)\<`void`\>

---

### revokeOthers()

> **revokeOthers**(): [`StynxSessionsAdapterResult`](../type-aliases/StynxSessionsAdapterResult.md)\<`void`\>

Defined in: [types.ts:27](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-sessions/src/types.ts#L27)

#### Returns

[`StynxSessionsAdapterResult`](../type-aliases/StynxSessionsAdapterResult.md)\<`void`\>

[**@stynx-nyx/angular-sessions**](../index.md)

---

[@stynx-nyx/angular-sessions](../index.md) / StynxActiveSessionsComponent

# Class: StynxActiveSessionsComponent

Defined in: [active-sessions.component.ts:191](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-sessions/src/active-sessions.component.ts#L191)

## Constructors

### Constructor

> **new StynxActiveSessionsComponent**(): `StynxActiveSessionsComponent`

#### Returns

`StynxActiveSessionsComponent`

## Properties

### adapter?

> `optional` **adapter?**: [`StynxSessionsAdapter`](../interfaces/StynxSessionsAdapter.md)

Defined in: [active-sessions.component.ts:197](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-sessions/src/active-sessions.component.ts#L197)

---

### busy

> `readonly` **busy**: `WritableSignal`\<`boolean`\>

Defined in: [active-sessions.component.ts:201](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-sessions/src/active-sessions.component.ts#L201)

---

### confirmingRevokeOthers

> `readonly` **confirmingRevokeOthers**: `WritableSignal`\<`boolean`\>

Defined in: [active-sessions.component.ts:200](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-sessions/src/active-sessions.component.ts#L200)

---

### sessionsState

> `readonly` **sessionsState**: `WritableSignal`\<[`StynxActiveSession`](../interfaces/StynxActiveSession.md)[]\>

Defined in: [active-sessions.component.ts:199](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-sessions/src/active-sessions.component.ts#L199)

## Accessors

### sessions

#### Get Signature

> **get** **sessions**(): [`StynxActiveSession`](../interfaces/StynxActiveSession.md)[]

Defined in: [active-sessions.component.ts:203](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-sessions/src/active-sessions.component.ts#L203)

##### Returns

[`StynxActiveSession`](../interfaces/StynxActiveSession.md)[]

## Methods

### load()

> **load**(): `Promise`\<`void`\>

Defined in: [active-sessions.component.ts:207](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-sessions/src/active-sessions.component.ts#L207)

#### Returns

`Promise`\<`void`\>

---

### revoke()

> **revoke**(`sid`): `Promise`\<`void`\>

Defined in: [active-sessions.component.ts:216](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-sessions/src/active-sessions.component.ts#L216)

#### Parameters

##### sid

`string`

#### Returns

`Promise`\<`void`\>

---

### revokeOthers()

> **revokeOthers**(): `Promise`\<`void`\>

Defined in: [active-sessions.component.ts:227](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-sessions/src/active-sessions.component.ts#L227)

#### Returns

`Promise`\<`void`\>

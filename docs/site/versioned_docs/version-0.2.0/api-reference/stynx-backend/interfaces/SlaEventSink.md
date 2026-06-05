[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / SlaEventSink

# Interface: SlaEventSink

Defined in: [packages/backend/src/sla/types.ts:25](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/sla/types.ts#L25)

## Methods

### aggregate()

> **aggregate**(`event`): `void`

Defined in: [packages/backend/src/sla/types.ts:27](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/sla/types.ts#L27)

#### Parameters

##### event

[`SlaAggregateEvent`](SlaAggregateEvent.md)

#### Returns

`void`

---

### sample()

> **sample**(`event`): `void`

Defined in: [packages/backend/src/sla/types.ts:26](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/sla/types.ts#L26)

#### Parameters

##### event

[`SlaSampleEvent`](SlaSampleEvent.md)

#### Returns

`void`

[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / LoggerSlaEventSink

# Class: LoggerSlaEventSink

Defined in: [packages/backend/src/sla/logger-sla-event.sink.ts:4](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/sla/logger-sla-event.sink.ts#L4)

## Implements

- [`SlaEventSink`](../interfaces/SlaEventSink.md)

## Constructors

### Constructor

> **new LoggerSlaEventSink**(`context?`): `LoggerSlaEventSink`

Defined in: [packages/backend/src/sla/logger-sla-event.sink.ts:7](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/sla/logger-sla-event.sink.ts#L7)

#### Parameters

##### context?

`string` = `'SlaMonitor'`

#### Returns

`LoggerSlaEventSink`

## Methods

### aggregate()

> **aggregate**(`event`): `void`

Defined in: [packages/backend/src/sla/logger-sla-event.sink.ts:15](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/sla/logger-sla-event.sink.ts#L15)

#### Parameters

##### event

[`SlaAggregateEvent`](../interfaces/SlaAggregateEvent.md)

#### Returns

`void`

#### Implementation of

[`SlaEventSink`](../interfaces/SlaEventSink.md).[`aggregate`](../interfaces/SlaEventSink.md#aggregate)

---

### sample()

> **sample**(`event`): `void`

Defined in: [packages/backend/src/sla/logger-sla-event.sink.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/sla/logger-sla-event.sink.ts#L11)

#### Parameters

##### event

[`SlaSampleEvent`](../interfaces/SlaSampleEvent.md)

#### Returns

`void`

#### Implementation of

[`SlaEventSink`](../interfaces/SlaEventSink.md).[`sample`](../interfaces/SlaEventSink.md#sample)

[**@stynx-nyx/logging**](../index.md)

---

[@stynx-nyx/logging](../index.md) / LoggingDedupeService

# Class: LoggingDedupeService

Defined in: [dedupe.ts:15](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/logging/src/dedupe.ts#L15)

## Constructors

### Constructor

> **new LoggingDedupeService**(`options?`): `LoggingDedupeService`

Defined in: [dedupe.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/logging/src/dedupe.ts#L19)

#### Parameters

##### options?

[`StynxLoggingOptions`](../interfaces/StynxLoggingOptions.md)

#### Returns

`LoggingDedupeService`

## Methods

### register()

> **register**(`message`, `stack?`): [`DedupeDecision`](../interfaces/DedupeDecision.md)

Defined in: [dedupe.ts:23](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/logging/src/dedupe.ts#L23)

#### Parameters

##### message

`string`

##### stack?

`string`

#### Returns

[`DedupeDecision`](../interfaces/DedupeDecision.md)

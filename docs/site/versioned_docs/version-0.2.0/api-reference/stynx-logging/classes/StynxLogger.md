[**@stynx-nyx/logging**](../index.md)

---

[@stynx-nyx/logging](../index.md) / StynxLogger

# Class: StynxLogger

Defined in: [logger.service.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/logging/src/logger.service.ts#L10)

## Constructors

### Constructor

> **new StynxLogger**(`logger`, `fieldFactory`, `dedupe`): `StynxLogger`

Defined in: [logger.service.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/logging/src/logger.service.ts#L11)

#### Parameters

##### logger

`Logger`

##### fieldFactory

[`RequestLogFieldFactory`](RequestLogFieldFactory.md)

##### dedupe

[`LoggingDedupeService`](LoggingDedupeService.md)

#### Returns

`StynxLogger`

## Methods

### debug()

> **debug**(`message`, `context?`): `void`

Defined in: [logger.service.ts:26](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/logging/src/logger.service.ts#L26)

#### Parameters

##### message

`string`

##### context?

[`LogContext`](../type-aliases/LogContext.md)

#### Returns

`void`

---

### error()

> **error**(`message`, `traceOrContext?`, `contextOrFields?`): `void`

Defined in: [logger.service.ts:34](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/logging/src/logger.service.ts#L34)

#### Parameters

##### message

`string`

##### traceOrContext?

`string` \| [`RequestScopedLogFields`](../interfaces/RequestScopedLogFields.md)

##### contextOrFields?

[`LogContext`](../type-aliases/LogContext.md)

#### Returns

`void`

---

### log()

> **log**(`message`, `context?`): `void`

Defined in: [logger.service.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/logging/src/logger.service.ts#L18)

#### Parameters

##### message

`string`

##### context?

[`LogContext`](../type-aliases/LogContext.md)

#### Returns

`void`

---

### verbose()

> **verbose**(`message`, `context?`): `void`

Defined in: [logger.service.ts:30](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/logging/src/logger.service.ts#L30)

#### Parameters

##### message

`string`

##### context?

[`LogContext`](../type-aliases/LogContext.md)

#### Returns

`void`

---

### warn()

> **warn**(`message`, `context?`): `void`

Defined in: [logger.service.ts:22](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/logging/src/logger.service.ts#L22)

#### Parameters

##### message

`string`

##### context?

[`LogContext`](../type-aliases/LogContext.md)

#### Returns

`void`

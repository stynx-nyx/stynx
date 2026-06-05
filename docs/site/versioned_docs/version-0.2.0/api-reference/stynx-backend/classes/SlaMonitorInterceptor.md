[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / SlaMonitorInterceptor

# Class: SlaMonitorInterceptor

Defined in: [packages/backend/src/sla/sla-monitor.interceptor.ts:36](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/sla/sla-monitor.interceptor.ts#L36)

## Implements

- `NestInterceptor`

## Constructors

### Constructor

> **new SlaMonitorInterceptor**(`options?`, `categoryResolver?`, `sink?`): `SlaMonitorInterceptor`

Defined in: [packages/backend/src/sla/sla-monitor.interceptor.ts:45](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/sla/sla-monitor.interceptor.ts#L45)

#### Parameters

##### options?

[`SlaMonitorInterceptorOptions`](../interfaces/SlaMonitorInterceptorOptions.md)

##### categoryResolver?

[`SlaCategoryResolver`](../interfaces/SlaCategoryResolver.md)

##### sink?

[`SlaEventSink`](../interfaces/SlaEventSink.md)

#### Returns

`SlaMonitorInterceptor`

## Methods

### intercept()

> **intercept**(`context`, `next`): `Observable`\<`unknown`\>

Defined in: [packages/backend/src/sla/sla-monitor.interceptor.ts:60](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/sla/sla-monitor.interceptor.ts#L60)

Method to implement a custom interceptor.

#### Parameters

##### context

`ExecutionContext`

an `ExecutionContext` object providing methods to access the
route handler and class about to be invoked.

##### next

`CallHandler`

a reference to the `CallHandler`, which provides access to an
`Observable` representing the response stream from the route handler.

#### Returns

`Observable`\<`unknown`\>

#### Implementation of

`NestInterceptor.intercept`

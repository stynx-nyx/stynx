[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / AuditInterceptor

# Class: AuditInterceptor

Defined in: [packages/backend/src/audit/audit.interceptor.ts:23](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/audit/audit.interceptor.ts#L23)

## Implements

- `NestInterceptor`

## Constructors

### Constructor

> **new AuditInterceptor**(`reflector`, `auditSink`, `metadataRedactionPolicy?`): `AuditInterceptor`

Defined in: [packages/backend/src/audit/audit.interceptor.ts:26](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/audit/audit.interceptor.ts#L26)

#### Parameters

##### reflector

`Reflector`

##### auditSink

[`AuditSink`](../interfaces/AuditSink.md)

##### metadataRedactionPolicy?

[`AuditMetadataRedactionPolicy`](../interfaces/AuditMetadataRedactionPolicy.md)

#### Returns

`AuditInterceptor`

## Methods

### intercept()

> **intercept**(`context`, `next`): `Observable`\<`unknown`\>

Defined in: [packages/backend/src/audit/audit.interceptor.ts:34](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/audit/audit.interceptor.ts#L34)

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

[**@stynx-nyx/sdk**](../index.md)

---

[@stynx-nyx/sdk](../index.md) / StynxAuditService

# Class: StynxAuditService

Defined in: [packages-web/sdk/src/generated/services/StynxAuditService.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/StynxAuditService.ts#L9)

## Constructors

### Constructor

> **new StynxAuditService**(`httpRequest`): `StynxAuditService`

Defined in: [packages-web/sdk/src/generated/services/StynxAuditService.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/StynxAuditService.ts#L10)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`StynxAuditService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/StynxAuditService.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/StynxAuditService.ts#L10)

## Methods

### stynxAuditGetAuditLogList()

> **stynxAuditGetAuditLogList**(): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`AuditLogPage`](../type-aliases/AuditLogPage.md)\>

Defined in: [packages-web/sdk/src/generated/services/StynxAuditService.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/StynxAuditService.ts#L16)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`AuditLogPage`](../type-aliases/AuditLogPage.md)\>

AuditLogPage OK

#### Throws

ApiError

[**@stynx-web/angular-audit**](../index.md)

---

[@stynx-web/angular-audit](../index.md) / AuditApiService

# Class: AuditApiService

Defined in: [audit-api.service.ts:40](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-api.service.ts#L40)

## Constructors

### Constructor

> **new AuditApiService**(): `AuditApiService`

#### Returns

`AuditApiService`

## Properties

### entityHistory

> `readonly` **entityHistory**: `Signal`\<[`AuditEventSummary`](../interfaces/AuditEventSummary.md)[]\>

Defined in: [audit-api.service.ts:46](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-api.service.ts#L46)

---

### events

> `readonly` **events**: `Signal`\<[`AuditEventSummary`](../interfaces/AuditEventSummary.md)[]\>

Defined in: [audit-api.service.ts:45](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-api.service.ts#L45)

## Methods

### getEvent()

> **getEvent**(`eventId`): `Observable`\<[`AuditEventDetail`](../interfaces/AuditEventDetail.md)\>

Defined in: [audit-api.service.ts:68](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-api.service.ts#L68)

#### Parameters

##### eventId

`string`

#### Returns

`Observable`\<[`AuditEventDetail`](../interfaces/AuditEventDetail.md)\>

---

### listEntityHistory()

> **listEntityHistory**(`resource`, `id`, `cursor?`, `filter?`): `Observable`\<[`AuditPage`](../interfaces/AuditPage.md)\<[`AuditEventSummary`](../interfaces/AuditEventSummary.md)\>\>

Defined in: [audit-api.service.ts:72](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-api.service.ts#L72)

#### Parameters

##### resource

`string`

##### id

`string`

##### cursor?

`string`

##### filter?

[`AuditEntityHistoryFilter`](../interfaces/AuditEntityHistoryFilter.md) = `{}`

#### Returns

`Observable`\<[`AuditPage`](../interfaces/AuditPage.md)\<[`AuditEventSummary`](../interfaces/AuditEventSummary.md)\>\>

---

### listEvents()

> **listEvents**(`filter?`, `cursor?`): `Observable`\<[`AuditPage`](../interfaces/AuditPage.md)\<[`AuditEventSummary`](../interfaces/AuditEventSummary.md)\>\>

Defined in: [audit-api.service.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-api.service.ts#L48)

#### Parameters

##### filter?

[`AuditFilter`](../interfaces/AuditFilter.md) = `{}`

##### cursor?

`string`

#### Returns

`Observable`\<[`AuditPage`](../interfaces/AuditPage.md)\<[`AuditEventSummary`](../interfaces/AuditEventSummary.md)\>\>

---

### verifyHashIntegrity()

> **verifyHashIntegrity**(`eventId`): `Observable`\<[`AuditIntegrityReport`](../interfaces/AuditIntegrityReport.md)\>

Defined in: [audit-api.service.ts:91](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-api.service.ts#L91)

#### Parameters

##### eventId

`string`

#### Returns

`Observable`\<[`AuditIntegrityReport`](../interfaces/AuditIntegrityReport.md)\>

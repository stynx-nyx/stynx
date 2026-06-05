[**@stynx-web/angular-audit**](../index.md)

---

[@stynx-web/angular-audit](../index.md) / StynxAuditEventDetailComponent

# Class: StynxAuditEventDetailComponent

Defined in: [audit-event-detail.component.ts:255](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-event-detail.component.ts#L255)

## Constructors

### Constructor

> **new StynxAuditEventDetailComponent**(): `StynxAuditEventDetailComponent`

#### Returns

`StynxAuditEventDetailComponent`

## Properties

### actorLabel

> `readonly` **actorLabel**: `Signal`\<`string`\>

Defined in: [audit-event-detail.component.ts:263](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-event-detail.component.ts#L263)

---

### afterJson

> `readonly` **afterJson**: `Signal`\<`string`\>

Defined in: [audit-event-detail.component.ts:275](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-event-detail.component.ts#L275)

---

### beforeJson

> `readonly` **beforeJson**: `Signal`\<`string`\>

Defined in: [audit-event-detail.component.ts:274](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-event-detail.component.ts#L274)

---

### entityLabel

> `readonly` **entityLabel**: `Signal`\<`string`\>

Defined in: [audit-event-detail.component.ts:267](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-event-detail.component.ts#L267)

---

### error

> `readonly` **error**: `WritableSignal`\<`string`\>

Defined in: [audit-event-detail.component.ts:261](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-event-detail.component.ts#L261)

---

### event

> `readonly` **event**: `WritableSignal`\<[`AuditEventDetail`](../interfaces/AuditEventDetail.md) \| `null`\>

Defined in: [audit-event-detail.component.ts:257](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-event-detail.component.ts#L257)

---

### eventIdValue

> `readonly` **eventIdValue**: `WritableSignal`\<`string`\>

Defined in: [audit-event-detail.component.ts:256](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-event-detail.component.ts#L256)

---

### integrity

> `readonly` **integrity**: `WritableSignal`\<[`AuditIntegrityReport`](../interfaces/AuditIntegrityReport.md) \| `null`\>

Defined in: [audit-event-detail.component.ts:258](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-event-detail.component.ts#L258)

---

### integrityError

> `readonly` **integrityError**: `WritableSignal`\<`string`\>

Defined in: [audit-event-detail.component.ts:262](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-event-detail.component.ts#L262)

---

### integrityLoading

> `readonly` **integrityLoading**: `WritableSignal`\<`boolean`\>

Defined in: [audit-event-detail.component.ts:260](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-event-detail.component.ts#L260)

---

### integrityTitleKey

> `readonly` **integrityTitleKey**: `Signal`\<`"audit.integrity.valid"` \| `"audit.integrity.broken"`\>

Defined in: [audit-event-detail.component.ts:278](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-event-detail.component.ts#L278)

---

### integrityTone

> `readonly` **integrityTone**: `Signal`\<`"valid"` \| `"broken"`\>

Defined in: [audit-event-detail.component.ts:277](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-event-detail.component.ts#L277)

---

### loading

> `readonly` **loading**: `WritableSignal`\<`boolean`\>

Defined in: [audit-event-detail.component.ts:259](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-event-detail.component.ts#L259)

---

### metadataJson

> `readonly` **metadataJson**: `Signal`\<`string`\>

Defined in: [audit-event-detail.component.ts:276](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-event-detail.component.ts#L276)

## Accessors

### eventId

#### Set Signature

> **set** **eventId**(`value`): `void`

Defined in: [audit-event-detail.component.ts:285](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-event-detail.component.ts#L285)

##### Parameters

###### value

`string`

##### Returns

`void`

## Methods

### formatTimestamp()

> **formatTimestamp**(`value`): `string`

Defined in: [audit-event-detail.component.ts:312](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-event-detail.component.ts#L312)

#### Parameters

##### value

`string`

#### Returns

`string`

---

### verifyIntegrity()

> **verifyIntegrity**(): `void`

Defined in: [audit-event-detail.component.ts:297](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-event-detail.component.ts#L297)

#### Returns

`void`

[**@stynx-web/angular-audit**](../index.md)

---

[@stynx-web/angular-audit](../index.md) / StynxAuditLogComponent

# Class: StynxAuditLogComponent

Defined in: [audit-log.component.ts:320](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-log.component.ts#L320)

## Constructors

### Constructor

> **new StynxAuditLogComponent**(): `StynxAuditLogComponent`

Defined in: [audit-log.component.ts:350](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-log.component.ts#L350)

#### Returns

`StynxAuditLogComponent`

## Properties

### activeFilterChips

> `readonly` **activeFilterChips**: `Signal`\<`string`[]\>

Defined in: [audit-log.component.ts:335](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-log.component.ts#L335)

---

### error

> `readonly` **error**: `WritableSignal`\<`string`\>

Defined in: [audit-log.component.ts:329](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-log.component.ts#L329)

---

### events

> `readonly` **events**: `WritableSignal`\<[`AuditEventSummary`](../interfaces/AuditEventSummary.md)[]\>

Defined in: [audit-log.component.ts:327](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-log.component.ts#L327)

---

### filterForm

> `readonly` **filterForm**: `FormGroup`\<`ɵNonNullableFormControls`\<\{ `action`: `string`[]; `actorId`: `string`[]; `entityId`: `string`[]; `entityKind`: `string`[]; `search`: `string`[]; \}\>\>

Defined in: [audit-log.component.ts:342](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-log.component.ts#L342)

---

### loading

> `readonly` **loading**: `WritableSignal`\<`boolean`\>

Defined in: [audit-log.component.ts:328](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-log.component.ts#L328)

---

### pageIndex

> `readonly` **pageIndex**: `WritableSignal`\<`number`\>

Defined in: [audit-log.component.ts:330](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-log.component.ts#L330)

---

### pageSize

> `readonly` **pageSize**: `WritableSignal`\<`number`\>

Defined in: [audit-log.component.ts:331](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-log.component.ts#L331)

---

### virtualTotal

> `readonly` **virtualTotal**: `Signal`\<`number`\>

Defined in: [audit-log.component.ts:332](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-log.component.ts#L332)

## Methods

### actorLabel()

> **actorLabel**(`event`): `string`

Defined in: [audit-log.component.ts:387](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-log.component.ts#L387)

#### Parameters

##### event

[`AuditEventSummary`](../interfaces/AuditEventSummary.md)

#### Returns

`string`

---

### applyFilters()

> **applyFilters**(): `void`

Defined in: [audit-log.component.ts:354](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-log.component.ts#L354)

#### Returns

`void`

---

### clearFilters()

> **clearFilters**(): `void`

Defined in: [audit-log.component.ts:369](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-log.component.ts#L369)

#### Returns

`void`

---

### entityLabel()

> **entityLabel**(`event`): `string`

Defined in: [audit-log.component.ts:391](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-log.component.ts#L391)

#### Parameters

##### event

[`AuditEventSummary`](../interfaces/AuditEventSummary.md)

#### Returns

`string`

---

### formatTimestamp()

> **formatTimestamp**(`value`): `string`

Defined in: [audit-log.component.ts:395](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-log.component.ts#L395)

#### Parameters

##### value

`string`

#### Returns

`string`

---

### integrityLabel()

> **integrityLabel**(`value`): `string`

Defined in: [audit-log.component.ts:400](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-log.component.ts#L400)

#### Parameters

##### value

[`AuditIntegrityTone`](../type-aliases/AuditIntegrityTone.md)

#### Returns

`string`

---

### pageChanged()

> **pageChanged**(`nextPage`): `void`

Defined in: [audit-log.component.ts:380](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-log.component.ts#L380)

#### Parameters

##### nextPage

`number`

#### Returns

`void`

---

### refresh()

> **refresh**(): `void`

Defined in: [audit-log.component.ts:376](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/audit-log.component.ts#L376)

#### Returns

`void`

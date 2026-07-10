[**@stynx-nyx/angular-audit**](../index.md)

---

[@stynx-nyx/angular-audit](../index.md) / StynxEntityHistoryComponent

# Class: StynxEntityHistoryComponent

Defined in: [entity-history.component.ts:194](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/entity-history.component.ts#L194)

## Constructors

### Constructor

> **new StynxEntityHistoryComponent**(): `StynxEntityHistoryComponent`

#### Returns

`StynxEntityHistoryComponent`

## Properties

### canLoad

> `readonly` **canLoad**: `Signal`\<`boolean`\>

Defined in: [entity-history.component.ts:206](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/entity-history.component.ts#L206)

---

### error

> `readonly` **error**: `WritableSignal`\<`string`\>

Defined in: [entity-history.component.ts:203](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/entity-history.component.ts#L203)

---

### events

> `readonly` **events**: `WritableSignal`\<[`AuditEventSummary`](../interfaces/AuditEventSummary.md)[]\>

Defined in: [entity-history.component.ts:201](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/entity-history.component.ts#L201)

---

### idValue

> `readonly` **idValue**: `WritableSignal`\<`string`\>

Defined in: [entity-history.component.ts:200](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/entity-history.component.ts#L200)

---

### loading

> `readonly` **loading**: `WritableSignal`\<`boolean`\>

Defined in: [entity-history.component.ts:202](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/entity-history.component.ts#L202)

---

### pageIndex

> `readonly` **pageIndex**: `WritableSignal`\<`number`\>

Defined in: [entity-history.component.ts:204](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/entity-history.component.ts#L204)

---

### pageSize

> `readonly` **pageSize**: `WritableSignal`\<`number`\>

Defined in: [entity-history.component.ts:205](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/entity-history.component.ts#L205)

---

### resourceValue

> `readonly` **resourceValue**: `WritableSignal`\<`string`\>

Defined in: [entity-history.component.ts:199](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/entity-history.component.ts#L199)

---

### virtualTotal

> `readonly` **virtualTotal**: `Signal`\<`number`\>

Defined in: [entity-history.component.ts:207](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/entity-history.component.ts#L207)

## Accessors

### id

#### Set Signature

> **set** **id**(`value`): `void`

Defined in: [entity-history.component.ts:218](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/entity-history.component.ts#L218)

##### Parameters

###### value

`string`

##### Returns

`void`

---

### resource

#### Set Signature

> **set** **resource**(`value`): `void`

Defined in: [entity-history.component.ts:212](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/entity-history.component.ts#L212)

##### Parameters

###### value

`string`

##### Returns

`void`

## Methods

### actorLabel()

> **actorLabel**(`event`): `string`

Defined in: [entity-history.component.ts:235](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/entity-history.component.ts#L235)

#### Parameters

##### event

[`AuditEventSummary`](../interfaces/AuditEventSummary.md)

#### Returns

`string`

---

### diffText()

> **diffText**(`event`): `string`

Defined in: [entity-history.component.ts:248](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/entity-history.component.ts#L248)

#### Parameters

##### event

[`AuditEventSummary`](../interfaces/AuditEventSummary.md)

#### Returns

`string`

---

### entityLabel()

> **entityLabel**(`event`): `string`

Defined in: [entity-history.component.ts:239](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/entity-history.component.ts#L239)

#### Parameters

##### event

[`AuditEventSummary`](../interfaces/AuditEventSummary.md)

#### Returns

`string`

---

### formatTimestamp()

> **formatTimestamp**(`value`): `string`

Defined in: [entity-history.component.ts:243](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/entity-history.component.ts#L243)

#### Parameters

##### value

`string`

#### Returns

`string`

---

### pageChanged()

> **pageChanged**(`nextPage`): `void`

Defined in: [entity-history.component.ts:229](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/entity-history.component.ts#L229)

#### Parameters

##### nextPage

`number`

#### Returns

`void`

---

### refresh()

> **refresh**(): `void`

Defined in: [entity-history.component.ts:223](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/entity-history.component.ts#L223)

#### Returns

`void`

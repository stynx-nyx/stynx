[**@stynx-web/angular-audit**](../index.md)

---

[@stynx-web/angular-audit](../index.md) / AuditEventDetail

# Interface: AuditEventDetail

Defined in: [types.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/types.ts#L48)

## Extends

- [`AuditEventSummary`](AuditEventSummary.md)

## Properties

### action

> `readonly` **action**: `string`

Defined in: [types.ts:42](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/types.ts#L42)

#### Inherited from

[`AuditEventSummary`](AuditEventSummary.md).[`action`](AuditEventSummary.md#action)

---

### actor

> `readonly` **actor**: [`AuditActorSummary`](AuditActorSummary.md)

Defined in: [types.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/types.ts#L41)

#### Inherited from

[`AuditEventSummary`](AuditEventSummary.md).[`actor`](AuditEventSummary.md#actor)

---

### after?

> `readonly` `optional` **after?**: `Record`\<`string`, `unknown`\> \| `null`

Defined in: [types.ts:53](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/types.ts#L53)

---

### before?

> `readonly` `optional` **before?**: `Record`\<`string`, `unknown`\> \| `null`

Defined in: [types.ts:52](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/types.ts#L52)

---

### entity

> `readonly` **entity**: [`AuditEntitySummary`](AuditEntitySummary.md)

Defined in: [types.ts:43](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/types.ts#L43)

#### Inherited from

[`AuditEventSummary`](AuditEventSummary.md).[`entity`](AuditEventSummary.md#entity)

---

### eventId

> `readonly` **eventId**: `string`

Defined in: [types.ts:38](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/types.ts#L38)

#### Inherited from

[`AuditEventSummary`](AuditEventSummary.md).[`eventId`](AuditEventSummary.md#eventid)

---

### integrity

> `readonly` **integrity**: [`AuditIntegrityTone`](../type-aliases/AuditIntegrityTone.md)

Defined in: [types.ts:45](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/types.ts#L45)

#### Inherited from

[`AuditEventSummary`](AuditEventSummary.md).[`integrity`](AuditEventSummary.md#integrity)

---

### ipAddress?

> `readonly` `optional` **ipAddress?**: `string` \| `null`

Defined in: [types.ts:50](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/types.ts#L50)

---

### metadata

> `readonly` **metadata**: `Record`\<`string`, `unknown`\>

Defined in: [types.ts:51](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/types.ts#L51)

---

### occurredAt

> `readonly` **occurredAt**: `string`

Defined in: [types.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/types.ts#L39)

#### Inherited from

[`AuditEventSummary`](AuditEventSummary.md).[`occurredAt`](AuditEventSummary.md#occurredat)

---

### previousHash?

> `readonly` `optional` **previousHash?**: `string` \| `null`

Defined in: [types.ts:54](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/types.ts#L54)

---

### requestId?

> `readonly` `optional` **requestId?**: `string` \| `null`

Defined in: [types.ts:44](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/types.ts#L44)

#### Inherited from

[`AuditEventSummary`](AuditEventSummary.md).[`requestId`](AuditEventSummary.md#requestid)

---

### rowHash?

> `readonly` `optional` **rowHash?**: `string` \| `null`

Defined in: [types.ts:55](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/types.ts#L55)

---

### sessionId?

> `readonly` `optional` **sessionId?**: `string` \| `null`

Defined in: [types.ts:49](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/types.ts#L49)

---

### tenantId?

> `readonly` `optional` **tenantId?**: `string` \| `null`

Defined in: [types.ts:40](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-audit/src/types.ts#L40)

#### Inherited from

[`AuditEventSummary`](AuditEventSummary.md).[`tenantId`](AuditEventSummary.md#tenantid)

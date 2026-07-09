[**@stynx-nyx/cli**](../index.md)

---

[@stynx-nyx/cli](../index.md) / AdoptScanReport

# Interface: AdoptScanReport

Defined in: [adopt.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/cli/src/adopt.ts#L19)

## Properties

### authLayer

> **authLayer**: `object`

Defined in: [adopt.ts:42](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/cli/src/adopt.ts#L42)

#### customJwtMiddleware

> **customJwtMiddleware**: `string`[]

---

### invariants

> **invariants**: `object`

Defined in: [adopt.ts:24](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/cli/src/adopt.ts#L24)

#### audit

> **audit**: `object`

##### audit.missingAuditTables

> **missingAuditTables**: `string`[]

#### rawDbConnection

> **rawDbConnection**: `object`

##### rawDbConnection.callSites

> **callSites**: `string`[]

##### rawDbConnection.pgImports

> **pgImports**: `string`[]

#### routePermissions

> **routePermissions**: [`RouteCandidate`](RouteCandidate.md)[]

#### softDelete

> **softDelete**: `object`

##### softDelete.adHocSoftDeleteTables

> **adHocSoftDeleteTables**: `string`[]

##### softDelete.missingArchiveTables

> **missingArchiveTables**: `string`[]

#### tenancy

> **tenancy**: `object`

##### tenancy.missingRlsTables

> **missingRlsTables**: `string`[]

##### tenancy.organizationIdTables

> **organizationIdTables**: `string`[]

---

### migrations

> **migrations**: `number`

Defined in: [adopt.ts:23](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/cli/src/adopt.ts#L23)

---

### nodeFiles

> **nodeFiles**: `number`

Defined in: [adopt.ts:21](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/cli/src/adopt.ts#L21)

---

### other

> **other**: `object`

Defined in: [adopt.ts:45](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/cli/src/adopt.ts#L45)

#### appendOnlyCandidates

> **appendOnlyCandidates**: `string`[]

#### readOnlyCandidates

> **readOnlyCandidates**: `string`[]

---

### repository

> **repository**: `string`

Defined in: [adopt.ts:20](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/cli/src/adopt.ts#L20)

---

### sqlFiles

> **sqlFiles**: `number`

Defined in: [adopt.ts:22](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/cli/src/adopt.ts#L22)

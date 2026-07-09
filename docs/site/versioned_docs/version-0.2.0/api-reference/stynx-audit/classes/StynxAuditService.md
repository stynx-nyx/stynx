[**@stynx-nyx/audit**](../index.md)

---

[@stynx-nyx/audit](../index.md) / StynxAuditService

# Class: StynxAuditService

Defined in: [audit.service.ts:66](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/audit/src/audit.service.ts#L66)

## Constructors

### Constructor

> **new StynxAuditService**(`moduleRef`, `options`, `clock`, `dumpRunner?`, `archiveStore?`): `StynxAuditService`

Defined in: [audit.service.ts:69](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/audit/src/audit.service.ts#L69)

#### Parameters

##### moduleRef

`ModuleRef`

##### options

[`StynxAuditModuleOptions`](../interfaces/StynxAuditModuleOptions.md)

##### clock

[`AuditClock`](../interfaces/AuditClock.md)

##### dumpRunner?

[`AuditDumpRunner`](../interfaces/AuditDumpRunner.md) \| `null`

##### archiveStore?

[`AuditArchiveStore`](../interfaces/AuditArchiveStore.md) \| `null`

#### Returns

`StynxAuditService`

## Methods

### detachEligible()

> **detachEligible**(`now?`): `Promise`\<[`AuditDetachPlan`](../interfaces/AuditDetachPlan.md)[]\>

Defined in: [audit.service.ts:222](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/audit/src/audit.service.ts#L222)

#### Parameters

##### now?

`Date` = `...`

#### Returns

`Promise`\<[`AuditDetachPlan`](../interfaces/AuditDetachPlan.md)[]\>

---

### dryRunDetachEligible()

> **dryRunDetachEligible**(`now?`): `Promise`\<[`AuditDetachPlan`](../interfaces/AuditDetachPlan.md)[]\>

Defined in: [audit.service.ts:168](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/audit/src/audit.service.ts#L168)

#### Parameters

##### now?

`Date` = `...`

#### Returns

`Promise`\<[`AuditDetachPlan`](../interfaces/AuditDetachPlan.md)[]\>

---

### listLog()

> **listLog**(`query?`): `Promise`\<[`AuditLogPage`](../interfaces/AuditLogPage.md)\>

Defined in: [audit.service.ts:83](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/audit/src/audit.service.ts#L83)

#### Parameters

##### query?

[`AuditLogQuery`](../interfaces/AuditLogQuery.md) = `{}`

#### Returns

`Promise`\<[`AuditLogPage`](../interfaces/AuditLogPage.md)\>

---

### runDailyDetachJob()

> **runDailyDetachJob**(): `Promise`\<`void`\>

Defined in: [audit.service.ts:262](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/audit/src/audit.service.ts#L262)

#### Returns

`Promise`\<`void`\>

---

### verifyChain()

> **verifyChain**(`tenancyId`, `limit?`): `Promise`\<[`ChainVerificationResult`](../interfaces/ChainVerificationResult.md)\>

Defined in: [audit.service.ts:269](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/audit/src/audit.service.ts#L269)

#### Parameters

##### tenancyId

`string`

##### limit?

`number` = `1000`

#### Returns

`Promise`\<[`ChainVerificationResult`](../interfaces/ChainVerificationResult.md)\>

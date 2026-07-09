[**@stynx-nyx/audit**](../index.md)

---

[@stynx-nyx/audit](../index.md) / planAuditDetach

# Function: planAuditDetach()

> **planAuditDetach**(`candidate`, `now`, `keyPrefix?`): [`AuditDetachPlan`](../interfaces/AuditDetachPlan.md) \| `null`

Defined in: [retention.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/audit/src/retention.ts#L9)

## Parameters

### candidate

[`AuditPartitionCandidate`](../interfaces/AuditPartitionCandidate.md)

### now

`Date`

### keyPrefix?

`string` = `'audit'`

## Returns

[`AuditDetachPlan`](../interfaces/AuditDetachPlan.md) \| `null`

[**@stynx-nyx/backend**](../index.md)

---

[@stynx-nyx/backend](../index.md) / PgIdentityLocalSyncAdapterOptions

# Interface: PgIdentityLocalSyncAdapterOptions

Defined in: [packages/backend/src/identity-admin/pg-local-sync.adapter.ts:37](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/pg-local-sync.adapter.ts#L37)

## Properties

### db

> **db**: [`IdentityLocalSyncSqlExecutor`](IdentityLocalSyncSqlExecutor.md)

Defined in: [packages/backend/src/identity-admin/pg-local-sync.adapter.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/pg-local-sync.adapter.ts#L39)

---

### displayNameFromDetail?

> `optional` **displayNameFromDetail?**: (`detail`) => `string` \| `undefined`

Defined in: [packages/backend/src/identity-admin/pg-local-sync.adapter.ts:43](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/pg-local-sync.adapter.ts#L43)

#### Parameters

##### detail

[`IdentityUserDetail`](IdentityUserDetail.md)

#### Returns

`string` \| `undefined`

---

### identityAdmin

> **identityAdmin**: [`IdentityAdminAdapter`](IdentityAdminAdapter.md)

Defined in: [packages/backend/src/identity-admin/pg-local-sync.adapter.ts:38](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/pg-local-sync.adapter.ts#L38)

---

### loadGroupMetaRows?

> `optional` **loadGroupMetaRows?**: (`db`) => `Promise`\<[`IdentityGroupMetaRow`](IdentityGroupMetaRow.md)[]\>

Defined in: [packages/backend/src/identity-admin/pg-local-sync.adapter.ts:45](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/pg-local-sync.adapter.ts#L45)

#### Parameters

##### db

[`IdentityLocalSyncSqlExecutor`](IdentityLocalSyncSqlExecutor.md)

#### Returns

`Promise`\<[`IdentityGroupMetaRow`](IdentityGroupMetaRow.md)[]\>

---

### resolveUsernameByUserId?

> `optional` **resolveUsernameByUserId?**: (`userId`, `db`) => `Promise`\<`string` \| `undefined`\>

Defined in: [packages/backend/src/identity-admin/pg-local-sync.adapter.ts:44](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/pg-local-sync.adapter.ts#L44)

#### Parameters

##### userId

`string`

##### db

[`IdentityLocalSyncSqlExecutor`](IdentityLocalSyncSqlExecutor.md)

#### Returns

`Promise`\<`string` \| `undefined`\>

---

### roleCodeFromGroupName?

> `optional` **roleCodeFromGroupName?**: (`groupName`) => `string`

Defined in: [packages/backend/src/identity-admin/pg-local-sync.adapter.ts:40](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/pg-local-sync.adapter.ts#L40)

#### Parameters

##### groupName

`string`

#### Returns

`string`

---

### roleDescriptionFromGroup?

> `optional` **roleDescriptionFromGroup?**: (`group`) => `string`

Defined in: [packages/backend/src/identity-admin/pg-local-sync.adapter.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/pg-local-sync.adapter.ts#L41)

#### Parameters

##### group

[`IdentityGroupSummary`](IdentityGroupSummary.md)

#### Returns

`string`

---

### userIdFromDetail?

> `optional` **userIdFromDetail?**: (`detail`) => `string` \| `undefined`

Defined in: [packages/backend/src/identity-admin/pg-local-sync.adapter.ts:42](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/pg-local-sync.adapter.ts#L42)

#### Parameters

##### detail

[`IdentityUserDetail`](IdentityUserDetail.md)

#### Returns

`string` \| `undefined`

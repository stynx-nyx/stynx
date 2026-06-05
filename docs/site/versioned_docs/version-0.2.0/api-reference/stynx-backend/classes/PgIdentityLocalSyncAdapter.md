[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / PgIdentityLocalSyncAdapter

# Class: PgIdentityLocalSyncAdapter

Defined in: [packages/backend/src/identity-admin/pg-local-sync.adapter.ts:151](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/pg-local-sync.adapter.ts#L151)

Generic Postgres local sync adapter used by IdentityAdminService optional localSyncAdapter hook.
Mirrors shared pieces of PORM identity sync:

- provider users/groups -> local auth.users/auth.roles/auth.user_roles
- optional group metadata enrichment for role-selection endpoints

## Implements

- [`IdentityLocalSyncAdapter`](../interfaces/IdentityLocalSyncAdapter.md)

## Constructors

### Constructor

> **new PgIdentityLocalSyncAdapter**(`options`): `PgIdentityLocalSyncAdapter`

Defined in: [packages/backend/src/identity-admin/pg-local-sync.adapter.ts:161](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/pg-local-sync.adapter.ts#L161)

#### Parameters

##### options

[`PgIdentityLocalSyncAdapterOptions`](../interfaces/PgIdentityLocalSyncAdapterOptions.md)

#### Returns

`PgIdentityLocalSyncAdapter`

## Methods

### listGroupsWithMetaByUserId()

> **listGroupsWithMetaByUserId**(`userId`): `Promise`\<\{ `groups`: [`IdentityGroupMeta`](../interfaces/IdentityGroupMeta.md)[]; \}\>

Defined in: [packages/backend/src/identity-admin/pg-local-sync.adapter.ts:246](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/pg-local-sync.adapter.ts#L246)

#### Parameters

##### userId

`string`

#### Returns

`Promise`\<\{ `groups`: [`IdentityGroupMeta`](../interfaces/IdentityGroupMeta.md)[]; \}\>

#### Implementation of

[`IdentityLocalSyncAdapter`](../interfaces/IdentityLocalSyncAdapter.md).[`listGroupsWithMetaByUserId`](../interfaces/IdentityLocalSyncAdapter.md#listgroupswithmetabyuserid)

---

### syncToLocal()

> **syncToLocal**(`context?`): `Promise`\<[`IdentityLocalSyncResult`](../interfaces/IdentityLocalSyncResult.md)\>

Defined in: [packages/backend/src/identity-admin/pg-local-sync.adapter.ts:169](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/pg-local-sync.adapter.ts#L169)

#### Parameters

##### context?

[`IdentitySyncContext`](../interfaces/IdentitySyncContext.md)

#### Returns

`Promise`\<[`IdentityLocalSyncResult`](../interfaces/IdentityLocalSyncResult.md)\>

#### Implementation of

[`IdentityLocalSyncAdapter`](../interfaces/IdentityLocalSyncAdapter.md).[`syncToLocal`](../interfaces/IdentityLocalSyncAdapter.md#synctolocal)

---

### syncUser()

> **syncUser**(`username`, `context?`): `Promise`\<[`IdentityLocalSyncResult`](../interfaces/IdentityLocalSyncResult.md) & `object`\>

Defined in: [packages/backend/src/identity-admin/pg-local-sync.adapter.ts:213](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/pg-local-sync.adapter.ts#L213)

#### Parameters

##### username

`string`

##### context?

[`IdentitySyncContext`](../interfaces/IdentitySyncContext.md)

#### Returns

`Promise`\<[`IdentityLocalSyncResult`](../interfaces/IdentityLocalSyncResult.md) & `object`\>

#### Implementation of

[`IdentityLocalSyncAdapter`](../interfaces/IdentityLocalSyncAdapter.md).[`syncUser`](../interfaces/IdentityLocalSyncAdapter.md#syncuser)

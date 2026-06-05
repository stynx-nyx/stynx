[**@stynx/contracts**](../index.md)

---

[@stynx/contracts](../index.md) / IdentityLocalSyncAdapter

# Interface: IdentityLocalSyncAdapter

Defined in: [packages/contracts/src/identity-admin.ts:80](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/identity-admin.ts#L80)

## Methods

### listGroupsWithMetaByUserId()

> **listGroupsWithMetaByUserId**(`userId`): `Promise`\<\{ `groups`: [`IdentityGroupMeta`](IdentityGroupMeta.md)[]; \}\>

Defined in: [packages/contracts/src/identity-admin.ts:86](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/identity-admin.ts#L86)

#### Parameters

##### userId

`string`

#### Returns

`Promise`\<\{ `groups`: [`IdentityGroupMeta`](IdentityGroupMeta.md)[]; \}\>

---

### syncToLocal()

> **syncToLocal**(`context?`): `Promise`\<[`IdentityLocalSyncResult`](IdentityLocalSyncResult.md)\>

Defined in: [packages/contracts/src/identity-admin.ts:81](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/identity-admin.ts#L81)

#### Parameters

##### context?

[`IdentitySyncContext`](IdentitySyncContext.md)

#### Returns

`Promise`\<[`IdentityLocalSyncResult`](IdentityLocalSyncResult.md)\>

---

### syncUser()

> **syncUser**(`username`, `context?`): `Promise`\<[`IdentityLocalSyncResult`](IdentityLocalSyncResult.md) & `object`\>

Defined in: [packages/contracts/src/identity-admin.ts:82](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/identity-admin.ts#L82)

#### Parameters

##### username

`string`

##### context?

[`IdentitySyncContext`](IdentitySyncContext.md)

#### Returns

`Promise`\<[`IdentityLocalSyncResult`](IdentityLocalSyncResult.md) & `object`\>

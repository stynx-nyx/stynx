[**@stynx-nyx/backend**](../index.md)

---

[@stynx-nyx/backend](../index.md) / PormIdentityAdminFacade

# Class: PormIdentityAdminFacade

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:126](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L126)

## Constructors

### Constructor

> **new PormIdentityAdminFacade**(`identityAdmin`): `PormIdentityAdminFacade`

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:127](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L127)

#### Parameters

##### identityAdmin

[`IdentityAdminService`](IdentityAdminService.md)

#### Returns

`PormIdentityAdminFacade`

## Methods

### addToGroup()

> **addToGroup**(`username`, `groupName`): `Promise`\<\{ `added`: `true`; \}\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:225](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L225)

#### Parameters

##### username

`string`

##### groupName

`string`

#### Returns

`Promise`\<\{ `added`: `true`; \}\>

---

### disable()

> **disable**(`username`): `Promise`\<\{ `disabled`: `true`; \}\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:198](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L198)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<\{ `disabled`: `true`; \}\>

---

### enable()

> **enable**(`username`): `Promise`\<\{ `enabled`: `true`; \}\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:203](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L203)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<\{ `enabled`: `true`; \}\>

---

### get()

> **get**(`username`): `Promise`\<[`PormIdentityListedUser`](../interfaces/PormIdentityListedUser.md)\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:156](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L156)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<[`PormIdentityListedUser`](../interfaces/PormIdentityListedUser.md)\>

---

### getBySub()

> **getBySub**(`sub`): `Promise`\<[`PormIdentityListedUser`](../interfaces/PormIdentityListedUser.md)\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:173](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L173)

#### Parameters

##### sub

`string`

#### Returns

`Promise`\<[`PormIdentityListedUser`](../interfaces/PormIdentityListedUser.md)\>

---

### list()

> **list**(`query`): `Promise`\<[`PormIdentityListUsersResult`](../interfaces/PormIdentityListUsersResult.md)\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:129](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L129)

#### Parameters

##### query

[`PormIdentityListUsersQuery`](../interfaces/PormIdentityListUsersQuery.md)

#### Returns

`Promise`\<[`PormIdentityListUsersResult`](../interfaces/PormIdentityListUsersResult.md)\>

---

### listAllGroups()

> **listAllGroups**(`query?`): `Promise`\<[`PormIdentityListAllGroupsResult`](../interfaces/PormIdentityListAllGroupsResult.md)\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:217](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L217)

#### Parameters

##### query?

###### limit?

`number`

###### token?

`string`

#### Returns

`Promise`\<[`PormIdentityListAllGroupsResult`](../interfaces/PormIdentityListAllGroupsResult.md)\>

---

### listGroups()

> **listGroups**(`username`): `Promise`\<[`PormIdentityListGroupsResult`](../interfaces/PormIdentityListGroupsResult.md)\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:208](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L208)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<[`PormIdentityListGroupsResult`](../interfaces/PormIdentityListGroupsResult.md)\>

---

### listGroupsWithMetaByUserId()

> **listGroupsWithMetaByUserId**(`userId`): `Promise`\<\{ `groups`: [`IdentityGroupMeta`](../interfaces/IdentityGroupMeta.md)[]; \}\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:213](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L213)

#### Parameters

##### userId

`string`

#### Returns

`Promise`\<\{ `groups`: [`IdentityGroupMeta`](../interfaces/IdentityGroupMeta.md)[]; \}\>

---

### removeFromGroup()

> **removeFromGroup**(`username`, `groupName`): `Promise`\<\{ `removed`: `true`; \}\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:230](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L230)

#### Parameters

##### username

`string`

##### groupName

`string`

#### Returns

`Promise`\<\{ `removed`: `true`; \}\>

---

### resetPassword()

> **resetPassword**(`username`): `Promise`\<\{ `reset`: `true`; \}\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:243](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L243)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<\{ `reset`: `true`; \}\>

---

### setPassword()

> **setPassword**(`username`, `newPassword`, `permanent?`): `Promise`\<\{ `updated`: `true`; \}\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:248](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L248)

#### Parameters

##### username

`string`

##### newPassword

`string`

##### permanent?

`boolean` = `true`

#### Returns

`Promise`\<\{ `updated`: `true`; \}\>

---

### syncToLocal()

> **syncToLocal**(`context?`): `Promise`\<[`IdentityLocalSyncResult`](../interfaces/IdentityLocalSyncResult.md)\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:257](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L257)

#### Parameters

##### context?

[`IdentitySyncContext`](../interfaces/IdentitySyncContext.md)

#### Returns

`Promise`\<[`IdentityLocalSyncResult`](../interfaces/IdentityLocalSyncResult.md)\>

---

### syncUser()

> **syncUser**(`username`, `context?`): `Promise`\<[`IdentityLocalSyncResult`](../interfaces/IdentityLocalSyncResult.md) & `object`\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:261](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L261)

#### Parameters

##### username

`string`

##### context?

[`IdentitySyncContext`](../interfaces/IdentitySyncContext.md)

#### Returns

`Promise`\<[`IdentityLocalSyncResult`](../interfaces/IdentityLocalSyncResult.md) & `object`\>

---

### update()

> **update**(`username`, `request`): `Promise`\<\{ `updated`: `boolean`; \}\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:178](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L178)

#### Parameters

##### username

`string`

##### request

[`PormIdentityUpdateUserRequest`](../interfaces/PormIdentityUpdateUserRequest.md)

#### Returns

`Promise`\<\{ `updated`: `boolean`; \}\>

---

### verify()

> **verify**(`username`, `request`): `Promise`\<\{ `verified`: `boolean`; \}\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:235](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L235)

#### Parameters

##### username

`string`

##### request

[`PormIdentityVerifyRequest`](../interfaces/PormIdentityVerifyRequest.md)

#### Returns

`Promise`\<\{ `verified`: `boolean`; \}\>

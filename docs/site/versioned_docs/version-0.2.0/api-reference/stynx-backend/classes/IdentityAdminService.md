[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / IdentityAdminService

# Class: IdentityAdminService

Defined in: [packages/backend/src/identity-admin/identity-admin.service.ts:40](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/identity-admin.service.ts#L40)

## Constructors

### Constructor

> **new IdentityAdminService**(`adapter`, `localSyncAdapter?`): `IdentityAdminService`

Defined in: [packages/backend/src/identity-admin/identity-admin.service.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/identity-admin.service.ts#L41)

#### Parameters

##### adapter

[`IdentityAdminAdapter`](../interfaces/IdentityAdminAdapter.md)

##### localSyncAdapter?

[`IdentityLocalSyncAdapter`](../interfaces/IdentityLocalSyncAdapter.md)

#### Returns

`IdentityAdminService`

## Methods

### addUserToGroup()

> **addUserToGroup**(`username`, `groupName`): `Promise`\<\{ `ok`: `true`; \}\>

Defined in: [packages/backend/src/identity-admin/identity-admin.service.ts:95](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/identity-admin.service.ts#L95)

#### Parameters

##### username

`string`

##### groupName

`string`

#### Returns

`Promise`\<\{ `ok`: `true`; \}\>

---

### disableUser()

> **disableUser**(`username`): `Promise`\<\{ `ok`: `true`; \}\>

Defined in: [packages/backend/src/identity-admin/identity-admin.service.ts:73](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/identity-admin.service.ts#L73)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<\{ `ok`: `true`; \}\>

---

### enableUser()

> **enableUser**(`username`): `Promise`\<\{ `ok`: `true`; \}\>

Defined in: [packages/backend/src/identity-admin/identity-admin.service.ts:80](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/identity-admin.service.ts#L80)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<\{ `ok`: `true`; \}\>

---

### getUser()

> **getUser**(`username`): `Promise`\<[`IdentityUserDetail`](../interfaces/IdentityUserDetail.md)\>

Defined in: [packages/backend/src/identity-admin/identity-admin.service.ts:52](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/identity-admin.service.ts#L52)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<[`IdentityUserDetail`](../interfaces/IdentityUserDetail.md)\>

---

### getUserBySubject()

> **getUserBySubject**(`subject`): `Promise`\<[`IdentityUserDetail`](../interfaces/IdentityUserDetail.md)\>

Defined in: [packages/backend/src/identity-admin/identity-admin.service.ts:56](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/identity-admin.service.ts#L56)

#### Parameters

##### subject

`string`

#### Returns

`Promise`\<[`IdentityUserDetail`](../interfaces/IdentityUserDetail.md)\>

---

### listGroups()

> **listGroups**(`query?`): `Promise`\<[`IdentityListGroupsResult`](../interfaces/IdentityListGroupsResult.md)\>

Defined in: [packages/backend/src/identity-admin/identity-admin.service.ts:91](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/identity-admin.service.ts#L91)

#### Parameters

##### query?

###### limit?

`number`

###### token?

`string`

#### Returns

`Promise`\<[`IdentityListGroupsResult`](../interfaces/IdentityListGroupsResult.md)\>

---

### listGroupsForUser()

> **listGroupsForUser**(`username`): `Promise`\<[`IdentityGroupSummary`](../interfaces/IdentityGroupSummary.md)[]\>

Defined in: [packages/backend/src/identity-admin/identity-admin.service.ts:87](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/identity-admin.service.ts#L87)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<[`IdentityGroupSummary`](../interfaces/IdentityGroupSummary.md)[]\>

---

### listGroupsWithMetaByUserId()

> **listGroupsWithMetaByUserId**(`userId`): `Promise`\<\{ `groups`: [`IdentityGroupMeta`](../interfaces/IdentityGroupMeta.md)[]; \}\>

Defined in: [packages/backend/src/identity-admin/identity-admin.service.ts:155](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/identity-admin.service.ts#L155)

#### Parameters

##### userId

`string`

#### Returns

`Promise`\<\{ `groups`: [`IdentityGroupMeta`](../interfaces/IdentityGroupMeta.md)[]; \}\>

---

### listUsers()

> **listUsers**(`query`): `Promise`\<[`IdentityListUsersResult`](../interfaces/IdentityListUsersResult.md)\>

Defined in: [packages/backend/src/identity-admin/identity-admin.service.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/identity-admin.service.ts#L48)

#### Parameters

##### query

[`IdentityListUsersQuery`](../interfaces/IdentityListUsersQuery.md)

#### Returns

`Promise`\<[`IdentityListUsersResult`](../interfaces/IdentityListUsersResult.md)\>

---

### removeUserFromGroup()

> **removeUserFromGroup**(`username`, `groupName`): `Promise`\<\{ `ok`: `true`; \}\>

Defined in: [packages/backend/src/identity-admin/identity-admin.service.ts:102](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/identity-admin.service.ts#L102)

#### Parameters

##### username

`string`

##### groupName

`string`

#### Returns

`Promise`\<\{ `ok`: `true`; \}\>

---

### resetUserPassword()

> **resetUserPassword**(`username`): `Promise`\<\{ `ok`: `true`; \}\>

Defined in: [packages/backend/src/identity-admin/identity-admin.service.ts:109](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/identity-admin.service.ts#L109)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<\{ `ok`: `true`; \}\>

---

### setUserPassword()

> **setUserPassword**(`username`, `password`, `permanent?`): `Promise`\<\{ `ok`: `true`; \}\>

Defined in: [packages/backend/src/identity-admin/identity-admin.service.ts:116](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/identity-admin.service.ts#L116)

#### Parameters

##### username

`string`

##### password

`string`

##### permanent?

`boolean` = `true`

#### Returns

`Promise`\<\{ `ok`: `true`; \}\>

---

### syncToLocal()

> **syncToLocal**(`context?`): `Promise`\<[`IdentityLocalSyncResult`](../interfaces/IdentityLocalSyncResult.md)\>

Defined in: [packages/backend/src/identity-admin/identity-admin.service.ts:147](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/identity-admin.service.ts#L147)

#### Parameters

##### context?

[`IdentitySyncContext`](../interfaces/IdentitySyncContext.md)

#### Returns

`Promise`\<[`IdentityLocalSyncResult`](../interfaces/IdentityLocalSyncResult.md)\>

---

### syncUser()

> **syncUser**(`username`, `context?`): `Promise`\<[`IdentityLocalSyncResult`](../interfaces/IdentityLocalSyncResult.md) & `object`\>

Defined in: [packages/backend/src/identity-admin/identity-admin.service.ts:151](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/identity-admin.service.ts#L151)

#### Parameters

##### username

`string`

##### context?

[`IdentitySyncContext`](../interfaces/IdentitySyncContext.md)

#### Returns

`Promise`\<[`IdentityLocalSyncResult`](../interfaces/IdentityLocalSyncResult.md) & `object`\>

---

### updateUser()

> **updateUser**(`username`, `request`): `Promise`\<[`IdentityUserDetail`](../interfaces/IdentityUserDetail.md)\>

Defined in: [packages/backend/src/identity-admin/identity-admin.service.ts:69](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/identity-admin.service.ts#L69)

#### Parameters

##### username

`string`

##### request

[`IdentityUpdateUserRequest`](../interfaces/IdentityUpdateUserRequest.md)

#### Returns

`Promise`\<[`IdentityUserDetail`](../interfaces/IdentityUserDetail.md)\>

---

### verifyUserChannels()

> **verifyUserChannels**(`username`, `request`): `Promise`\<\{ `ok`: `true`; \}\>

Defined in: [packages/backend/src/identity-admin/identity-admin.service.ts:130](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/identity-admin.service.ts#L130)

#### Parameters

##### username

`string`

##### request

[`IdentityVerifyChannelsRequest`](../interfaces/IdentityVerifyChannelsRequest.md)

#### Returns

`Promise`\<\{ `ok`: `true`; \}\>

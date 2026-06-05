[**@stynx-web/angular-iam**](../index.md)

---

[@stynx-web/angular-iam](../index.md) / IamApiService

# Class: IamApiService

Defined in: [iam-api.service.ts:65](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L65)

## Constructors

### Constructor

> **new IamApiService**(): `IamApiService`

#### Returns

`IamApiService`

## Properties

### groups

> `readonly` **groups**: `Signal`\<[`StynxGroup`](../interfaces/StynxGroup.md)[]\>

Defined in: [iam-api.service.ts:73](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L73)

---

### roles

> `readonly` **roles**: `Signal`\<[`StynxRole`](../interfaces/StynxRole.md)[]\>

Defined in: [iam-api.service.ts:72](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L72)

---

### users

> `readonly` **users**: `Signal`\<[`StynxUser`](../interfaces/StynxUser.md)[]\>

Defined in: [iam-api.service.ts:71](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L71)

## Methods

### cloneRole()

> **cloneRole**(`id`, `body`): `Observable`\<[`StynxRole`](../interfaces/StynxRole.md)\>

Defined in: [iam-api.service.ts:184](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L184)

#### Parameters

##### id

`string`

##### body

[`StynxCloneRoleRequest`](../interfaces/StynxCloneRoleRequest.md)

#### Returns

`Observable`\<[`StynxRole`](../interfaces/StynxRole.md)\>

---

### createGroup()

> **createGroup**(`body`): `Observable`\<[`StynxGroup`](../interfaces/StynxGroup.md)\>

Defined in: [iam-api.service.ts:212](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L212)

#### Parameters

##### body

[`StynxCreateGroupRequest`](../interfaces/StynxCreateGroupRequest.md)

#### Returns

`Observable`\<[`StynxGroup`](../interfaces/StynxGroup.md)\>

---

### createRole()

> **createRole**(`body`): `Observable`\<[`StynxRole`](../interfaces/StynxRole.md)\>

Defined in: [iam-api.service.ts:160](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L160)

#### Parameters

##### body

[`StynxCreateRoleRequest`](../interfaces/StynxCreateRoleRequest.md)

#### Returns

`Observable`\<[`StynxRole`](../interfaces/StynxRole.md)\>

---

### createUser()

> **createUser**(`body`): `Observable`\<[`StynxUser`](../interfaces/StynxUser.md)\>

Defined in: [iam-api.service.ts:96](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L96)

#### Parameters

##### body

[`StynxCreateUserRequest`](../interfaces/StynxCreateUserRequest.md)

#### Returns

`Observable`\<[`StynxUser`](../interfaces/StynxUser.md)\>

---

### deleteGroup()

> **deleteGroup**(`id`): `Observable`\<`void`\>

Defined in: [iam-api.service.ts:228](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L228)

#### Parameters

##### id

`string`

#### Returns

`Observable`\<`void`\>

---

### deleteRole()

> **deleteRole**(`id`): `Observable`\<`void`\>

Defined in: [iam-api.service.ts:176](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L176)

#### Parameters

##### id

`string`

#### Returns

`Observable`\<`void`\>

---

### disableUser()

> **disableUser**(`id`): `Observable`\<`void`\>

Defined in: [iam-api.service.ts:112](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L112)

#### Parameters

##### id

`string`

#### Returns

`Observable`\<`void`\>

---

### forceLogoutUser()

> **forceLogoutUser**(`id`): `Observable`\<`void`\>

Defined in: [iam-api.service.ts:124](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L124)

#### Parameters

##### id

`string`

#### Returns

`Observable`\<`void`\>

---

### getEffectivePermissions()

> **getEffectivePermissions**(`id`): `Observable`\<[`StynxEffectivePermissions`](../interfaces/StynxEffectivePermissions.md)\>

Defined in: [iam-api.service.ts:144](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L144)

#### Parameters

##### id

`string`

#### Returns

`Observable`\<[`StynxEffectivePermissions`](../interfaces/StynxEffectivePermissions.md)\>

---

### getUser()

> **getUser**(`id`): `Observable`\<[`StynxUserDetail`](../interfaces/StynxUserDetail.md)\>

Defined in: [iam-api.service.ts:92](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L92)

#### Parameters

##### id

`string`

#### Returns

`Observable`\<[`StynxUserDetail`](../interfaces/StynxUserDetail.md)\>

---

### inviteUser()

> **inviteUser**(`id`): `Observable`\<`void`\>

Defined in: [iam-api.service.ts:120](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L120)

#### Parameters

##### id

`string`

#### Returns

`Observable`\<`void`\>

---

### listGroupMembers()

> **listGroupMembers**(`id`): `Observable`\<[`StynxUser`](../interfaces/StynxUser.md)[]\>

Defined in: [iam-api.service.ts:244](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L244)

#### Parameters

##### id

`string`

#### Returns

`Observable`\<[`StynxUser`](../interfaces/StynxUser.md)[]\>

---

### listGroupRoles()

> **listGroupRoles**(`id`): `Observable`\<[`StynxRole`](../interfaces/StynxRole.md)[]\>

Defined in: [iam-api.service.ts:236](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L236)

#### Parameters

##### id

`string`

#### Returns

`Observable`\<[`StynxRole`](../interfaces/StynxRole.md)[]\>

---

### listGroups()

> **listGroups**(): `Observable`\<[`StynxGroup`](../interfaces/StynxGroup.md)[]\>

Defined in: [iam-api.service.ts:200](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L200)

#### Returns

`Observable`\<[`StynxGroup`](../interfaces/StynxGroup.md)[]\>

---

### listRolePermissions()

> **listRolePermissions**(`id`): `Observable`\<[`StynxPermission`](../interfaces/StynxPermission.md)[]\>

Defined in: [iam-api.service.ts:192](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L192)

#### Parameters

##### id

`string`

#### Returns

`Observable`\<[`StynxPermission`](../interfaces/StynxPermission.md)[]\>

---

### listRoles()

> **listRoles**(): `Observable`\<[`StynxRole`](../interfaces/StynxRole.md)[]\>

Defined in: [iam-api.service.ts:148](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L148)

#### Returns

`Observable`\<[`StynxRole`](../interfaces/StynxRole.md)[]\>

---

### listUserGroups()

> **listUserGroups**(`id`): `Observable`\<[`StynxGroup`](../interfaces/StynxGroup.md)[]\>

Defined in: [iam-api.service.ts:136](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L136)

#### Parameters

##### id

`string`

#### Returns

`Observable`\<[`StynxGroup`](../interfaces/StynxGroup.md)[]\>

---

### listUserRoles()

> **listUserRoles**(`id`): `Observable`\<[`StynxRole`](../interfaces/StynxRole.md)[]\>

Defined in: [iam-api.service.ts:128](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L128)

#### Parameters

##### id

`string`

#### Returns

`Observable`\<[`StynxRole`](../interfaces/StynxRole.md)[]\>

---

### listUsers()

> **listUsers**(`params?`): `Observable`\<[`PagedResult`](../interfaces/PagedResult.md)\<[`StynxUser`](../interfaces/StynxUser.md)\>\>

Defined in: [iam-api.service.ts:75](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L75)

#### Parameters

##### params?

[`IamListUsersParams`](../interfaces/IamListUsersParams.md) = `{}`

#### Returns

`Observable`\<[`PagedResult`](../interfaces/PagedResult.md)\<[`StynxUser`](../interfaces/StynxUser.md)\>\>

---

### patchGroup()

> **patchGroup**(`id`, `diff`): `Observable`\<[`StynxGroup`](../interfaces/StynxGroup.md)\>

Defined in: [iam-api.service.ts:220](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L220)

#### Parameters

##### id

`string`

##### diff

[`StynxPatchGroupRequest`](../type-aliases/StynxPatchGroupRequest.md)

#### Returns

`Observable`\<[`StynxGroup`](../interfaces/StynxGroup.md)\>

---

### patchRole()

> **patchRole**(`id`, `diff`): `Observable`\<[`StynxRole`](../interfaces/StynxRole.md)\>

Defined in: [iam-api.service.ts:168](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L168)

#### Parameters

##### id

`string`

##### diff

[`StynxPatchRoleRequest`](../type-aliases/StynxPatchRoleRequest.md)

#### Returns

`Observable`\<[`StynxRole`](../interfaces/StynxRole.md)\>

---

### patchUser()

> **patchUser**(`id`, `diff`): `Observable`\<[`StynxUser`](../interfaces/StynxUser.md)\>

Defined in: [iam-api.service.ts:104](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L104)

#### Parameters

##### id

`string`

##### diff

[`StynxPatchUserRequest`](../type-aliases/StynxPatchUserRequest.md)

#### Returns

`Observable`\<[`StynxUser`](../interfaces/StynxUser.md)\>

---

### reactivateUser()

> **reactivateUser**(`id`): `Observable`\<`void`\>

Defined in: [iam-api.service.ts:116](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L116)

#### Parameters

##### id

`string`

#### Returns

`Observable`\<`void`\>

---

### refreshGroups()

> **refreshGroups**(): `Observable`\<[`StynxGroup`](../interfaces/StynxGroup.md)[]\>

Defined in: [iam-api.service.ts:208](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L208)

#### Returns

`Observable`\<[`StynxGroup`](../interfaces/StynxGroup.md)[]\>

---

### refreshRoles()

> **refreshRoles**(): `Observable`\<[`StynxRole`](../interfaces/StynxRole.md)[]\>

Defined in: [iam-api.service.ts:156](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L156)

#### Returns

`Observable`\<[`StynxRole`](../interfaces/StynxRole.md)[]\>

---

### refreshUsers()

> **refreshUsers**(`params?`): `Observable`\<[`PagedResult`](../interfaces/PagedResult.md)\<[`StynxUser`](../interfaces/StynxUser.md)\>\>

Defined in: [iam-api.service.ts:88](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L88)

#### Parameters

##### params?

[`IamListUsersParams`](../interfaces/IamListUsersParams.md) = `{}`

#### Returns

`Observable`\<[`PagedResult`](../interfaces/PagedResult.md)\<[`StynxUser`](../interfaces/StynxUser.md)\>\>

---

### setGroupMembers()

> **setGroupMembers**(`id`, `userIds`): `Observable`\<`void`\>

Defined in: [iam-api.service.ts:248](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L248)

#### Parameters

##### id

`string`

##### userIds

`string`[]

#### Returns

`Observable`\<`void`\>

---

### setGroupRoles()

> **setGroupRoles**(`id`, `roleIds`): `Observable`\<`void`\>

Defined in: [iam-api.service.ts:240](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L240)

#### Parameters

##### id

`string`

##### roleIds

`string`[]

#### Returns

`Observable`\<`void`\>

---

### setRolePermissions()

> **setRolePermissions**(`id`, `permissionKeys`): `Observable`\<`void`\>

Defined in: [iam-api.service.ts:196](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L196)

#### Parameters

##### id

`string`

##### permissionKeys

`string`[]

#### Returns

`Observable`\<`void`\>

---

### setUserGroups()

> **setUserGroups**(`id`, `groupIds`): `Observable`\<`void`\>

Defined in: [iam-api.service.ts:140](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L140)

#### Parameters

##### id

`string`

##### groupIds

`string`[]

#### Returns

`Observable`\<`void`\>

---

### setUserRoles()

> **setUserRoles**(`id`, `roleIds`): `Observable`\<`void`\>

Defined in: [iam-api.service.ts:132](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/iam-api.service.ts#L132)

#### Parameters

##### id

`string`

##### roleIds

`string`[]

#### Returns

`Observable`\<`void`\>

[**@stynx/auth**](../index.md)

---

[@stynx/auth](../index.md) / CognitoIdentityAdminAdapter

# Class: CognitoIdentityAdminAdapter

Defined in: [cognito-admin.adapter.ts:97](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-admin.adapter.ts#L97)

## Implements

- `IdentityAdminAdapter`

## Constructors

### Constructor

> **new CognitoIdentityAdminAdapter**(`options`): `CognitoIdentityAdminAdapter`

Defined in: [cognito-admin.adapter.ts:101](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-admin.adapter.ts#L101)

#### Parameters

##### options

[`CognitoAdminAdapterOptions`](../interfaces/CognitoAdminAdapterOptions.md)

#### Returns

`CognitoIdentityAdminAdapter`

## Methods

### addUserToGroup()

> **addUserToGroup**(`username`, `groupName`): `Promise`\<`void`\>

Defined in: [cognito-admin.adapter.ts:291](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-admin.adapter.ts#L291)

#### Parameters

##### username

`string`

##### groupName

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

`IdentityAdminAdapter.addUserToGroup`

---

### disableUser()

> **disableUser**(`username`): `Promise`\<`void`\>

Defined in: [cognito-admin.adapter.ts:223](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-admin.adapter.ts#L223)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

`IdentityAdminAdapter.disableUser`

---

### enableUser()

> **enableUser**(`username`): `Promise`\<`void`\>

Defined in: [cognito-admin.adapter.ts:236](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-admin.adapter.ts#L236)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

`IdentityAdminAdapter.enableUser`

---

### getUser()

> **getUser**(`username`): `Promise`\<`IdentityUserDetail`\>

Defined in: [cognito-admin.adapter.ts:155](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-admin.adapter.ts#L155)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`IdentityUserDetail`\>

#### Implementation of

`IdentityAdminAdapter.getUser`

---

### getUserBySubject()

> **getUserBySubject**(`subject`): `Promise`\<`IdentityUserDetail`\>

Defined in: [cognito-admin.adapter.ts:169](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-admin.adapter.ts#L169)

#### Parameters

##### subject

`string`

#### Returns

`Promise`\<`IdentityUserDetail`\>

#### Implementation of

`IdentityAdminAdapter.getUserBySubject`

---

### listGroups()

> **listGroups**(`query?`): `Promise`\<`IdentityListGroupsResult`\>

Defined in: [cognito-admin.adapter.ts:268](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-admin.adapter.ts#L268)

#### Parameters

##### query?

###### limit?

`number`

###### token?

`string`

#### Returns

`Promise`\<`IdentityListGroupsResult`\>

#### Implementation of

`IdentityAdminAdapter.listGroups`

---

### listGroupsForUser()

> **listGroupsForUser**(`username`): `Promise`\<`IdentityGroupSummary`[]\>

Defined in: [cognito-admin.adapter.ts:249](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-admin.adapter.ts#L249)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`IdentityGroupSummary`[]\>

#### Implementation of

`IdentityAdminAdapter.listGroupsForUser`

---

### listUsers()

> **listUsers**(`query`): `Promise`\<`IdentityListUsersResult`\>

Defined in: [cognito-admin.adapter.ts:112](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-admin.adapter.ts#L112)

#### Parameters

##### query

`IdentityListUsersQuery`

#### Returns

`Promise`\<`IdentityListUsersResult`\>

#### Implementation of

`IdentityAdminAdapter.listUsers`

---

### removeUserFromGroup()

> **removeUserFromGroup**(`username`, `groupName`): `Promise`\<`void`\>

Defined in: [cognito-admin.adapter.ts:305](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-admin.adapter.ts#L305)

#### Parameters

##### username

`string`

##### groupName

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

`IdentityAdminAdapter.removeUserFromGroup`

---

### resetUserPassword()

> **resetUserPassword**(`username`): `Promise`\<`void`\>

Defined in: [cognito-admin.adapter.ts:319](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-admin.adapter.ts#L319)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

`IdentityAdminAdapter.resetUserPassword`

---

### setUserPassword()

> **setUserPassword**(`username`, `newPassword`, `permanent?`): `Promise`\<`void`\>

Defined in: [cognito-admin.adapter.ts:332](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-admin.adapter.ts#L332)

#### Parameters

##### username

`string`

##### newPassword

`string`

##### permanent?

`boolean` = `true`

#### Returns

`Promise`\<`void`\>

#### Implementation of

`IdentityAdminAdapter.setUserPassword`

---

### updateUser()

> **updateUser**(`username`, `request`): `Promise`\<`IdentityUserDetail`\>

Defined in: [cognito-admin.adapter.ts:189](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-admin.adapter.ts#L189)

#### Parameters

##### username

`string`

##### request

`IdentityUpdateUserRequest`

#### Returns

`Promise`\<`IdentityUserDetail`\>

#### Implementation of

`IdentityAdminAdapter.updateUser`

---

### verifyUserChannels()

> **verifyUserChannels**(`username`, `request`): `Promise`\<`void`\>

Defined in: [cognito-admin.adapter.ts:347](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-admin.adapter.ts#L347)

#### Parameters

##### username

`string`

##### request

`IdentityVerifyChannelsRequest`

#### Returns

`Promise`\<`void`\>

#### Implementation of

`IdentityAdminAdapter.verifyUserChannels`

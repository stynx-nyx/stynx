[**@stynx/contracts**](../index.md)

---

[@stynx/contracts](../index.md) / IdentityAdminAdapter

# Interface: IdentityAdminAdapter

Defined in: [packages/contracts/src/identity-admin.ts:89](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/identity-admin.ts#L89)

## Methods

### addUserToGroup()

> **addUserToGroup**(`username`, `groupName`): `Promise`\<`void`\>

Defined in: [packages/contracts/src/identity-admin.ts:98](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/identity-admin.ts#L98)

#### Parameters

##### username

`string`

##### groupName

`string`

#### Returns

`Promise`\<`void`\>

---

### disableUser()

> **disableUser**(`username`): `Promise`\<`void`\>

Defined in: [packages/contracts/src/identity-admin.ts:94](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/identity-admin.ts#L94)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`void`\>

---

### enableUser()

> **enableUser**(`username`): `Promise`\<`void`\>

Defined in: [packages/contracts/src/identity-admin.ts:95](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/identity-admin.ts#L95)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`void`\>

---

### getUser()

> **getUser**(`username`): `Promise`\<[`IdentityUserDetail`](IdentityUserDetail.md)\>

Defined in: [packages/contracts/src/identity-admin.ts:91](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/identity-admin.ts#L91)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<[`IdentityUserDetail`](IdentityUserDetail.md)\>

---

### getUserBySubject()?

> `optional` **getUserBySubject**(`subject`): `Promise`\<[`IdentityUserDetail`](IdentityUserDetail.md)\>

Defined in: [packages/contracts/src/identity-admin.ts:92](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/identity-admin.ts#L92)

#### Parameters

##### subject

`string`

#### Returns

`Promise`\<[`IdentityUserDetail`](IdentityUserDetail.md)\>

---

### listGroups()

> **listGroups**(`query?`): `Promise`\<[`IdentityListGroupsResult`](IdentityListGroupsResult.md)\>

Defined in: [packages/contracts/src/identity-admin.ts:97](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/identity-admin.ts#L97)

#### Parameters

##### query?

###### limit?

`number`

###### token?

`string`

#### Returns

`Promise`\<[`IdentityListGroupsResult`](IdentityListGroupsResult.md)\>

---

### listGroupsForUser()

> **listGroupsForUser**(`username`): `Promise`\<[`IdentityGroupSummary`](IdentityGroupSummary.md)[]\>

Defined in: [packages/contracts/src/identity-admin.ts:96](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/identity-admin.ts#L96)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<[`IdentityGroupSummary`](IdentityGroupSummary.md)[]\>

---

### listUsers()

> **listUsers**(`query`): `Promise`\<[`IdentityListUsersResult`](IdentityListUsersResult.md)\>

Defined in: [packages/contracts/src/identity-admin.ts:90](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/identity-admin.ts#L90)

#### Parameters

##### query

[`IdentityListUsersQuery`](IdentityListUsersQuery.md)

#### Returns

`Promise`\<[`IdentityListUsersResult`](IdentityListUsersResult.md)\>

---

### removeUserFromGroup()

> **removeUserFromGroup**(`username`, `groupName`): `Promise`\<`void`\>

Defined in: [packages/contracts/src/identity-admin.ts:99](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/identity-admin.ts#L99)

#### Parameters

##### username

`string`

##### groupName

`string`

#### Returns

`Promise`\<`void`\>

---

### resetUserPassword()

> **resetUserPassword**(`username`): `Promise`\<`void`\>

Defined in: [packages/contracts/src/identity-admin.ts:100](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/identity-admin.ts#L100)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<`void`\>

---

### setUserPassword()?

> `optional` **setUserPassword**(`username`, `newPassword`, `permanent?`): `Promise`\<`void`\>

Defined in: [packages/contracts/src/identity-admin.ts:101](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/identity-admin.ts#L101)

#### Parameters

##### username

`string`

##### newPassword

`string`

##### permanent?

`boolean`

#### Returns

`Promise`\<`void`\>

---

### updateUser()

> **updateUser**(`username`, `request`): `Promise`\<[`IdentityUserDetail`](IdentityUserDetail.md)\>

Defined in: [packages/contracts/src/identity-admin.ts:93](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/identity-admin.ts#L93)

#### Parameters

##### username

`string`

##### request

[`IdentityUpdateUserRequest`](IdentityUpdateUserRequest.md)

#### Returns

`Promise`\<[`IdentityUserDetail`](IdentityUserDetail.md)\>

---

### verifyUserChannels()?

> `optional` **verifyUserChannels**(`username`, `request`): `Promise`\<`void`\>

Defined in: [packages/contracts/src/identity-admin.ts:102](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/contracts/src/identity-admin.ts#L102)

#### Parameters

##### username

`string`

##### request

[`IdentityVerifyChannelsRequest`](IdentityVerifyChannelsRequest.md)

#### Returns

`Promise`\<`void`\>

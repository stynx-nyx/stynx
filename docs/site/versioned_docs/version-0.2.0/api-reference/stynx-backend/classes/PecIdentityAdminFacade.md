[**@stynx/backend**](../index.md)

---

[@stynx/backend](../index.md) / PecIdentityAdminFacade

# Class: PecIdentityAdminFacade

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:283](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L283)

## Constructors

### Constructor

> **new PecIdentityAdminFacade**(`identityAdmin`): `PecIdentityAdminFacade`

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:284](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L284)

#### Parameters

##### identityAdmin

[`IdentityAdminService`](IdentityAdminService.md)

#### Returns

`PecIdentityAdminFacade`

## Methods

### addToGroup()

> **addToGroup**(`username`, `groupName`): `Promise`\<\{ `ok`: `true`; \}\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:346](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L346)

#### Parameters

##### username

`string`

##### groupName

`string`

#### Returns

`Promise`\<\{ `ok`: `true`; \}\>

---

### disable()

> **disable**(`username`): `Promise`\<\{ `ok`: `true`; \}\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:334](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L334)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<\{ `ok`: `true`; \}\>

---

### enable()

> **enable**(`username`): `Promise`\<\{ `ok`: `true`; \}\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:338](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L338)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<\{ `ok`: `true`; \}\>

---

### get()

> **get**(`username`): `Promise`\<[`PecIdentityUserDetail`](../interfaces/PecIdentityUserDetail.md)\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:303](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L303)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<[`PecIdentityUserDetail`](../interfaces/PecIdentityUserDetail.md)\>

---

### list()

> **list**(`query`): `Promise`\<[`PecIdentityListUsersResult`](../interfaces/PecIdentityListUsersResult.md)\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:286](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L286)

#### Parameters

##### query

[`PecIdentityListUsersQuery`](../interfaces/PecIdentityListUsersQuery.md)

#### Returns

`Promise`\<[`PecIdentityListUsersResult`](../interfaces/PecIdentityListUsersResult.md)\>

---

### listAllGroups()

> **listAllGroups**(`query?`): `Promise`\<[`PecIdentityListAllGroupsResult`](../interfaces/PecIdentityListAllGroupsResult.md)\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:354](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L354)

#### Parameters

##### query?

###### limit?

`number`

###### token?

`string`

#### Returns

`Promise`\<[`PecIdentityListAllGroupsResult`](../interfaces/PecIdentityListAllGroupsResult.md)\>

---

### listGroups()

> **listGroups**(`username`): `Promise`\<[`IdentityGroupSummary`](../interfaces/IdentityGroupSummary.md)[]\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:342](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L342)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<[`IdentityGroupSummary`](../interfaces/IdentityGroupSummary.md)[]\>

---

### removeFromGroup()

> **removeFromGroup**(`username`, `groupName`): `Promise`\<\{ `ok`: `true`; \}\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:350](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L350)

#### Parameters

##### username

`string`

##### groupName

`string`

#### Returns

`Promise`\<\{ `ok`: `true`; \}\>

---

### resetPassword()

> **resetPassword**(`username`): `Promise`\<\{ `ok`: `true`; \}\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:368](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L368)

#### Parameters

##### username

`string`

#### Returns

`Promise`\<\{ `ok`: `true`; \}\>

---

### update()

> **update**(`username`, `request`): `Promise`\<[`PecIdentityUserDetail`](../interfaces/PecIdentityUserDetail.md)\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:315](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L315)

#### Parameters

##### username

`string`

##### request

[`PecIdentityUpdateUserRequest`](../interfaces/PecIdentityUpdateUserRequest.md)

#### Returns

`Promise`\<[`PecIdentityUserDetail`](../interfaces/PecIdentityUserDetail.md)\>

---

### verify()

> **verify**(`username`, `request`): `Promise`\<\{ `ok`: `true`; \}\>

Defined in: [packages/backend/src/identity-admin/integration-facades.ts:364](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/identity-admin/integration-facades.ts#L364)

#### Parameters

##### username

`string`

##### request

[`PecIdentityVerifyRequest`](../interfaces/PecIdentityVerifyRequest.md)

#### Returns

`Promise`\<\{ `ok`: `true`; \}\>

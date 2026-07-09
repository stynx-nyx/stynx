[**@stynx-nyx/testing**](../index.md)

---

[@stynx-nyx/testing](../index.md) / TestingFixtures

# Interface: TestingFixtures

Defined in: [testing/src/types.ts:103](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/testing/src/types.ts#L103)

## Methods

### createDocument()

> **createDocument**(`input`): `Promise`\<[`DocumentFixture`](DocumentFixture.md)\>

Defined in: [testing/src/types.ts:107](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/testing/src/types.ts#L107)

#### Parameters

##### input

`Partial`\<[`DocumentFixture`](DocumentFixture.md)\> & `Pick`\<[`DocumentFixture`](DocumentFixture.md), `"tenantId"` \| `"ownerUserId"`\>

#### Returns

`Promise`\<[`DocumentFixture`](DocumentFixture.md)\>

---

### createMembership()

> **createMembership**(`input`): `Promise`\<[`MembershipFixture`](MembershipFixture.md)\>

Defined in: [testing/src/types.ts:106](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/testing/src/types.ts#L106)

#### Parameters

##### input

`Partial`\<[`MembershipFixture`](MembershipFixture.md)\> & `Pick`\<[`MembershipFixture`](MembershipFixture.md), `"tenantId"` \| `"userId"`\>

#### Returns

`Promise`\<[`MembershipFixture`](MembershipFixture.md)\>

---

### createTenant()

> **createTenant**(`input?`): `Promise`\<[`TenantFixture`](TenantFixture.md)\>

Defined in: [testing/src/types.ts:104](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/testing/src/types.ts#L104)

#### Parameters

##### input?

`Partial`\<[`TenantFixture`](TenantFixture.md)\>

#### Returns

`Promise`\<[`TenantFixture`](TenantFixture.md)\>

---

### createUser()

> **createUser**(`input?`): `Promise`\<[`UserFixture`](UserFixture.md)\>

Defined in: [testing/src/types.ts:105](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/testing/src/types.ts#L105)

#### Parameters

##### input?

`Partial`\<[`UserFixture`](UserFixture.md)\>

#### Returns

`Promise`\<[`UserFixture`](UserFixture.md)\>

[**@stynx-nyx/auth**](../index.md)

---

[@stynx-nyx/auth](../index.md) / EffectiveHashComputer

# Class: EffectiveHashComputer

Defined in: [effective-hash-computer.ts:15](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/effective-hash-computer.ts#L15)

## Constructors

### Constructor

> **new EffectiveHashComputer**(`moduleRef`): `EffectiveHashComputer`

Defined in: [effective-hash-computer.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/effective-hash-computer.ts#L16)

#### Parameters

##### moduleRef

`ModuleRef`

#### Returns

`EffectiveHashComputer`

## Methods

### afterDirectPermissionMutation()

> **afterDirectPermissionMutation**(`trx`, `membershipIds`): `Promise`\<`void`\>

Defined in: [effective-hash-computer.ts:22](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/effective-hash-computer.ts#L22)

#### Parameters

##### trx

`Transaction`

##### membershipIds

`string`[]

#### Returns

`Promise`\<`void`\>

---

### afterGroupMembershipMutation()

> **afterGroupMembershipMutation**(`trx`, `membershipIds`): `Promise`\<`void`\>

Defined in: [effective-hash-computer.ts:26](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/effective-hash-computer.ts#L26)

#### Parameters

##### trx

`Transaction`

##### membershipIds

`string`[]

#### Returns

`Promise`\<`void`\>

---

### afterGroupRoleMutation()

> **afterGroupRoleMutation**(`trx`, `groupIds`): `Promise`\<`void`\>

Defined in: [effective-hash-computer.ts:57](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/effective-hash-computer.ts#L57)

#### Parameters

##### trx

`Transaction`

##### groupIds

`string`[]

#### Returns

`Promise`\<`void`\>

---

### afterMembershipRoleMutation()

> **afterMembershipRoleMutation**(`trx`, `membershipIds`): `Promise`\<`void`\>

Defined in: [effective-hash-computer.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/effective-hash-computer.ts#L18)

#### Parameters

##### trx

`Transaction`

##### membershipIds

`string`[]

#### Returns

`Promise`\<`void`\>

---

### afterPlatformRoleChange()

> **afterPlatformRoleChange**(`trx`): `Promise`\<`void`\>

Defined in: [effective-hash-computer.ts:72](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/effective-hash-computer.ts#L72)

#### Parameters

##### trx

`Transaction`

#### Returns

`Promise`\<`void`\>

---

### afterRolePermissionMutation()

> **afterRolePermissionMutation**(`trx`, `roleIds`): `Promise`\<`void`\>

Defined in: [effective-hash-computer.ts:30](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/effective-hash-computer.ts#L30)

#### Parameters

##### trx

`Transaction`

##### roleIds

`string`[]

#### Returns

`Promise`\<`void`\>

---

### ensureMembershipHash()

> **ensureMembershipHash**(`userId`, `tenantId`): `Promise`\<`void`\>

Defined in: [effective-hash-computer.ts:86](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/effective-hash-computer.ts#L86)

#### Parameters

##### userId

`string`

##### tenantId

`string`

#### Returns

`Promise`\<`void`\>

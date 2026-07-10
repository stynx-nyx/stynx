[**@stynx-nyx/angular-iam**](../index.md)

---

[@stynx-nyx/angular-iam](../index.md) / StynxRolesAdminComponent

# Class: StynxRolesAdminComponent

Defined in: [roles-admin.component.ts:286](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L286)

## Constructors

### Constructor

> **new StynxRolesAdminComponent**(): `StynxRolesAdminComponent`

Defined in: [roles-admin.component.ts:311](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L311)

#### Returns

`StynxRolesAdminComponent`

## Properties

### actionSaving

> `readonly` **actionSaving**: `WritableSignal`\<`boolean`\>

Defined in: [roles-admin.component.ts:302](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L302)

---

### api

> `protected` `readonly` **api**: [`IamApiService`](IamApiService.md)

Defined in: [roles-admin.component.ts:287](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L287)

---

### cloneSource

> `readonly` **cloneSource**: `WritableSignal`\<[`StynxRole`](../interfaces/StynxRole.md) \| `null`\>

Defined in: [roles-admin.component.ts:303](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L303)

---

### createOpen

> `readonly` **createOpen**: `WritableSignal`\<`boolean`\>

Defined in: [roles-admin.component.ts:299](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L299)

---

### dialogError

> `readonly` **dialogError**: `WritableSignal`\<`string`\>

Defined in: [roles-admin.component.ts:301](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L301)

---

### dialogSaving

> `readonly` **dialogSaving**: `WritableSignal`\<`boolean`\>

Defined in: [roles-admin.component.ts:300](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L300)

---

### error

> `readonly` **error**: `WritableSignal`\<`string`\>

Defined in: [roles-admin.component.ts:297](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L297)

---

### filteredRoles

> `readonly` **filteredRoles**: `Signal`\<[`StynxRole`](../interfaces/StynxRole.md)[]\>

Defined in: [roles-admin.component.ts:309](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L309)

---

### loading

> `readonly` **loading**: `WritableSignal`\<`boolean`\>

Defined in: [roles-admin.component.ts:296](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L296)

---

### roleSelected

> `readonly` **roleSelected**: `EventEmitter`\<[`StynxRole`](../interfaces/StynxRole.md)\>

Defined in: [roles-admin.component.ts:294](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L294)

---

### searchForm

> `readonly` **searchForm**: `FormGroup`\<`ɵNonNullableFormControls`\<\{ `q`: `string`[]; \}\>\>

Defined in: [roles-admin.component.ts:305](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L305)

---

### searchText

> `readonly` **searchText**: `WritableSignal`\<`string`\>

Defined in: [roles-admin.component.ts:298](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L298)

## Methods

### clearSearch()

> `protected` **clearSearch**(): `void`

Defined in: [roles-admin.component.ts:319](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L319)

#### Returns

`void`

---

### cloneRole()

> `protected` **cloneRole**(`body`): `void`

Defined in: [roles-admin.component.ts:361](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L361)

#### Parameters

##### body

[`StynxCloneRoleRequest`](../interfaces/StynxCloneRoleRequest.md)

#### Returns

`void`

---

### closeDialog()

> `protected` **closeDialog**(): `void`

Defined in: [roles-admin.component.ts:336](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L336)

#### Returns

`void`

---

### createRole()

> `protected` **createRole**(`body`): `void`

Defined in: [roles-admin.component.ts:344](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L344)

#### Parameters

##### body

[`StynxCreateRoleRequest`](../interfaces/StynxCreateRoleRequest.md)

#### Returns

`void`

---

### deleteRole()

> `protected` **deleteRole**(`role`): `void`

Defined in: [roles-admin.component.ts:383](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L383)

#### Parameters

##### role

[`StynxRole`](../interfaces/StynxRole.md)

#### Returns

`void`

---

### openCloneDialog()

> `protected` **openCloneDialog**(`role`): `void`

Defined in: [roles-admin.component.ts:330](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L330)

#### Parameters

##### role

[`StynxRole`](../interfaces/StynxRole.md)

#### Returns

`void`

---

### openCreateDialog()

> `protected` **openCreateDialog**(): `void`

Defined in: [roles-admin.component.ts:324](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L324)

#### Returns

`void`

---

### openDetail()

> `protected` **openDetail**(`role`): `void`

Defined in: [roles-admin.component.ts:401](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L401)

#### Parameters

##### role

[`StynxRole`](../interfaces/StynxRole.md)

#### Returns

`void`

---

### search()

> `protected` **search**(): `void`

Defined in: [roles-admin.component.ts:315](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/roles-admin.component.ts#L315)

#### Returns

`void`

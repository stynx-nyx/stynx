[**@stynx-web/angular-iam**](../index.md)

---

[@stynx-web/angular-iam](../index.md) / StynxUsersAdminComponent

# Class: StynxUsersAdminComponent

Defined in: [users-admin.component.ts:286](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L286)

## Constructors

### Constructor

> **new StynxUsersAdminComponent**(): `StynxUsersAdminComponent`

Defined in: [users-admin.component.ts:309](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L309)

#### Returns

`StynxUsersAdminComponent`

## Properties

### api

> `protected` `readonly` **api**: [`IamApiService`](IamApiService.md)

Defined in: [users-admin.component.ts:287](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L287)

---

### createError

> `readonly` **createError**: `WritableSignal`\<`string`\>

Defined in: [users-admin.component.ts:303](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L303)

---

### createOpen

> `readonly` **createOpen**: `WritableSignal`\<`boolean`\>

Defined in: [users-admin.component.ts:301](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L301)

---

### createSaving

> `readonly` **createSaving**: `WritableSignal`\<`boolean`\>

Defined in: [users-admin.component.ts:302](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L302)

---

### error

> `readonly` **error**: `WritableSignal`\<`string`\>

Defined in: [users-admin.component.ts:297](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L297)

---

### loading

> `readonly` **loading**: `WritableSignal`\<`boolean`\>

Defined in: [users-admin.component.ts:296](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L296)

---

### pageIndex

> `readonly` **pageIndex**: `WritableSignal`\<`number`\>

Defined in: [users-admin.component.ts:299](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L299)

---

### pageSize

> `readonly` **pageSize**: `WritableSignal`\<`number`\>

Defined in: [users-admin.component.ts:300](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L300)

---

### searchForm

> `readonly` **searchForm**: `FormGroup`\<`ɵNonNullableFormControls`\<\{ `q`: `string`[]; \}\>\>

Defined in: [users-admin.component.ts:305](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L305)

---

### total

> `readonly` **total**: `WritableSignal`\<`number`\>

Defined in: [users-admin.component.ts:298](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L298)

---

### userSelected

> `readonly` **userSelected**: `EventEmitter`\<[`StynxUser`](../interfaces/StynxUser.md)\>

Defined in: [users-admin.component.ts:294](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L294)

## Methods

### clearSearch()

> `protected` **clearSearch**(): `void`

Defined in: [users-admin.component.ts:326](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L326)

#### Returns

`void`

---

### closeCreateDialog()

> `protected` **closeCreateDialog**(): `void`

Defined in: [users-admin.component.ts:343](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L343)

#### Returns

`void`

---

### createUser()

> `protected` **createUser**(`body`): `void`

Defined in: [users-admin.component.ts:350](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L350)

#### Parameters

##### body

[`StynxCreateUserRequest`](../interfaces/StynxCreateUserRequest.md)

#### Returns

`void`

---

### displayName()

> `protected` **displayName**(`user`): `string`

Defined in: [users-admin.component.ts:313](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L313)

#### Parameters

##### user

[`StynxUser`](../interfaces/StynxUser.md)

#### Returns

`string`

---

### openCreateDialog()

> `protected` **openCreateDialog**(): `void`

Defined in: [users-admin.component.ts:338](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L338)

#### Returns

`void`

---

### openDetail()

> `protected` **openDetail**(`user`): `void`

Defined in: [users-admin.component.ts:367](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L367)

#### Parameters

##### user

[`StynxUser`](../interfaces/StynxUser.md)

#### Returns

`void`

---

### pageChanged()

> `protected` **pageChanged**(`event`): `void`

Defined in: [users-admin.component.ts:332](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L332)

#### Parameters

##### event

`StynxPageChange`

#### Returns

`void`

---

### search()

> `protected` **search**(): `void`

Defined in: [users-admin.component.ts:321](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L321)

#### Returns

`void`

---

### statusKey()

> `protected` **statusKey**(`user`): `string`

Defined in: [users-admin.component.ts:317](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/users-admin.component.ts#L317)

#### Parameters

##### user

[`StynxUser`](../interfaces/StynxUser.md)

#### Returns

`string`

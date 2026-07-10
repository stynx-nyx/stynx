[**@stynx-nyx/angular-iam**](../index.md)

---

[@stynx-nyx/angular-iam](../index.md) / StynxRoleCreateDialogComponent

# Class: StynxRoleCreateDialogComponent

Defined in: [role-create-dialog.component.ts:214](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-create-dialog.component.ts#L214)

## Constructors

### Constructor

> **new StynxRoleCreateDialogComponent**(): `StynxRoleCreateDialogComponent`

#### Returns

`StynxRoleCreateDialogComponent`

## Properties

### clone

> `readonly` **clone**: `EventEmitter`\<[`StynxCloneRoleRequest`](../interfaces/StynxCloneRoleRequest.md)\>

Defined in: [role-create-dialog.component.ts:222](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-create-dialog.component.ts#L222)

---

### create

> `readonly` **create**: `EventEmitter`\<[`StynxCreateRoleRequest`](../interfaces/StynxCreateRoleRequest.md)\>

Defined in: [role-create-dialog.component.ts:221](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-create-dialog.component.ts#L221)

---

### dismissed

> `readonly` **dismissed**: `EventEmitter`\<`void`\>

Defined in: [role-create-dialog.component.ts:223](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-create-dialog.component.ts#L223)

---

### error

> **error**: `string` = `''`

Defined in: [role-create-dialog.component.ts:219](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-create-dialog.component.ts#L219)

---

### form

> `readonly` **form**: `FormGroup`\<`ɵNonNullableFormControls`\<\{ `description`: `string`[]; `key`: (`string` \| (`control`) => `ValidationErrors` \| `null`[])[]; `name`: (`string` \| (`control`) => `ValidationErrors` \| `null`[])[]; \}\>\>

Defined in: [role-create-dialog.component.ts:225](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-create-dialog.component.ts#L225)

---

### open

> **open**: `boolean` = `false`

Defined in: [role-create-dialog.component.ts:217](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-create-dialog.component.ts#L217)

---

### saving

> **saving**: `boolean` = `false`

Defined in: [role-create-dialog.component.ts:218](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-create-dialog.component.ts#L218)

---

### sourceRole

> **sourceRole**: [`StynxRole`](../interfaces/StynxRole.md) \| `null` = `null`

Defined in: [role-create-dialog.component.ts:220](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-create-dialog.component.ts#L220)

## Accessors

### initialRole

#### Set Signature

> **set** **initialRole**(`value`): `void`

Defined in: [role-create-dialog.component.ts:232](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-create-dialog.component.ts#L232)

##### Parameters

###### value

[`StynxRole`](../interfaces/StynxRole.md) \| `null` \| `undefined`

##### Returns

`void`

## Methods

### submit()

> `protected` **submit**(): `void`

Defined in: [role-create-dialog.component.ts:253](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-create-dialog.component.ts#L253)

#### Returns

`void`

---

### submitKey()

> `protected` **submitKey**(): `string`

Defined in: [role-create-dialog.component.ts:249](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-create-dialog.component.ts#L249)

#### Returns

`string`

---

### titleKey()

> `protected` **titleKey**(): `string`

Defined in: [role-create-dialog.component.ts:245](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-create-dialog.component.ts#L245)

#### Returns

`string`

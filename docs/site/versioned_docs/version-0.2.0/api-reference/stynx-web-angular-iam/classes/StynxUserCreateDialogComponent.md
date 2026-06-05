[**@stynx-web/angular-iam**](../index.md)

---

[@stynx-web/angular-iam](../index.md) / StynxUserCreateDialogComponent

# Class: StynxUserCreateDialogComponent

Defined in: [user-create-dialog.component.ts:225](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-create-dialog.component.ts#L225)

## Constructors

### Constructor

> **new StynxUserCreateDialogComponent**(): `StynxUserCreateDialogComponent`

#### Returns

`StynxUserCreateDialogComponent`

## Properties

### create

> `readonly` **create**: `EventEmitter`\<[`StynxCreateUserRequest`](../interfaces/StynxCreateUserRequest.md)\>

Defined in: [user-create-dialog.component.ts:231](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-create-dialog.component.ts#L231)

---

### dismissed

> `readonly` **dismissed**: `EventEmitter`\<`void`\>

Defined in: [user-create-dialog.component.ts:232](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-create-dialog.component.ts#L232)

---

### error

> **error**: `string` = `''`

Defined in: [user-create-dialog.component.ts:230](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-create-dialog.component.ts#L230)

---

### form

> `readonly` **form**: `FormGroup`\<`ɵNonNullableFormControls`\<\{ `email`: (`string` \| (`control`) => `ValidationErrors` \| `null`[])[]; `firstName`: `string`[]; `lastName`: `string`[]; `locale`: (`string` \| (`control`) => `ValidationErrors` \| `null`[])[]; `sendInvite`: `boolean`[]; \}\>\>

Defined in: [user-create-dialog.component.ts:234](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-create-dialog.component.ts#L234)

---

### open

> **open**: `boolean` = `false`

Defined in: [user-create-dialog.component.ts:228](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-create-dialog.component.ts#L228)

---

### saving

> **saving**: `boolean` = `false`

Defined in: [user-create-dialog.component.ts:229](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-create-dialog.component.ts#L229)

## Methods

### reset()

> **reset**(): `void`

Defined in: [user-create-dialog.component.ts:268](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-create-dialog.component.ts#L268)

#### Returns

`void`

---

### submit()

> **submit**(): `void`

Defined in: [user-create-dialog.component.ts:242](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-create-dialog.component.ts#L242)

#### Returns

`void`

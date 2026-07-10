[**@stynx-nyx/angular-iam**](../index.md)

---

[@stynx-nyx/angular-iam](../index.md) / StynxRoleDetailComponent

# Class: StynxRoleDetailComponent

Defined in: [role-detail.component.ts:287](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-detail.component.ts#L287)

## Constructors

### Constructor

> **new StynxRoleDetailComponent**(): `StynxRoleDetailComponent`

#### Returns

`StynxRoleDetailComponent`

## Properties

### activeTab

> `readonly` **activeTab**: `WritableSignal`\<`RoleDetailTab`\>

Defined in: [role-detail.component.ts:301](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-detail.component.ts#L301)

---

### currentRoleId

> `readonly` **currentRoleId**: `Signal`\<`string`\>

Defined in: [role-detail.component.ts:302](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-detail.component.ts#L302)

---

### error

> `readonly` **error**: `WritableSignal`\<`string`\>

Defined in: [role-detail.component.ts:300](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-detail.component.ts#L300)

---

### loading

> `readonly` **loading**: `WritableSignal`\<`boolean`\>

Defined in: [role-detail.component.ts:298](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-detail.component.ts#L298)

---

### overviewForm

> `readonly` **overviewForm**: `FormGroup`\<`ɵNonNullableFormControls`\<\{ `description`: `string`[]; `key`: (`string` \| (`control`) => `ValidationErrors` \| `null`[])[]; `name`: (`string` \| (`control`) => `ValidationErrors` \| `null`[])[]; \}\>\>

Defined in: [role-detail.component.ts:304](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-detail.component.ts#L304)

---

### permissionsChanged

> `readonly` **permissionsChanged**: `EventEmitter`\<`string`[]\>

Defined in: [role-detail.component.ts:294](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-detail.component.ts#L294)

---

### role

> `readonly` **role**: `WritableSignal`\<[`StynxRole`](../interfaces/StynxRole.md) \| `null`\>

Defined in: [role-detail.component.ts:297](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-detail.component.ts#L297)

---

### roleChanged

> `readonly` **roleChanged**: `EventEmitter`\<[`StynxRole`](../interfaces/StynxRole.md)\>

Defined in: [role-detail.component.ts:293](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-detail.component.ts#L293)

---

### saving

> `readonly` **saving**: `WritableSignal`\<`boolean`\>

Defined in: [role-detail.component.ts:299](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-detail.component.ts#L299)

---

### tabs

> `readonly` **tabs**: `RoleDetailTab`[]

Defined in: [role-detail.component.ts:296](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-detail.component.ts#L296)

## Accessors

### roleId

#### Set Signature

> **set** **roleId**(`value`): `void`

Defined in: [role-detail.component.ts:311](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-detail.component.ts#L311)

##### Parameters

###### value

`string` \| `null` \| `undefined`

##### Returns

`void`

## Methods

### saveOverview()

> `protected` **saveOverview**(): `void`

Defined in: [role-detail.component.ts:327](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-detail.component.ts#L327)

#### Returns

`void`

---

### systemKey()

> `protected` **systemKey**(`role`): `string`

Defined in: [role-detail.component.ts:323](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-detail.component.ts#L323)

#### Parameters

##### role

[`StynxRole`](../interfaces/StynxRole.md)

#### Returns

`string`

---

### tabKey()

> `protected` **tabKey**(`tab`): `string`

Defined in: [role-detail.component.ts:319](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/role-detail.component.ts#L319)

#### Parameters

##### tab

`RoleDetailTab`

#### Returns

`string`

[**@stynx-nyx/angular-iam**](../index.md)

---

[@stynx-nyx/angular-iam](../index.md) / StynxGroupRolesEditorComponent

# Class: StynxGroupRolesEditorComponent

Defined in: [group-roles-editor.component.ts:147](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-roles-editor.component.ts#L147)

## Constructors

### Constructor

> **new StynxGroupRolesEditorComponent**(): `StynxGroupRolesEditorComponent`

#### Returns

`StynxGroupRolesEditorComponent`

## Properties

### assignedRoleIds

> `readonly` **assignedRoleIds**: `WritableSignal`\<`ReadonlySet`\<`string`\>\>

Defined in: [group-roles-editor.component.ts:156](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-roles-editor.component.ts#L156)

---

### currentGroupId

> `readonly` **currentGroupId**: `WritableSignal`\<`string`\>

Defined in: [group-roles-editor.component.ts:154](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-roles-editor.component.ts#L154)

---

### error

> `readonly` **error**: `WritableSignal`\<`string`\>

Defined in: [group-roles-editor.component.ts:159](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-roles-editor.component.ts#L159)

---

### loading

> `readonly` **loading**: `WritableSignal`\<`boolean`\>

Defined in: [group-roles-editor.component.ts:157](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-roles-editor.component.ts#L157)

---

### roles

> `readonly` **roles**: `WritableSignal`\<[`StynxRole`](../interfaces/StynxRole.md)[]\>

Defined in: [group-roles-editor.component.ts:155](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-roles-editor.component.ts#L155)

---

### rolesChanged

> `readonly` **rolesChanged**: `EventEmitter`\<`string`[]\>

Defined in: [group-roles-editor.component.ts:152](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-roles-editor.component.ts#L152)

---

### saving

> `readonly` **saving**: `WritableSignal`\<`boolean`\>

Defined in: [group-roles-editor.component.ts:158](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-roles-editor.component.ts#L158)

---

### selectedRoleIds

> `readonly` **selectedRoleIds**: `Signal`\<`string`[]\>

Defined in: [group-roles-editor.component.ts:160](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-roles-editor.component.ts#L160)

## Accessors

### groupId

#### Set Signature

> **set** **groupId**(`value`): `void`

Defined in: [group-roles-editor.component.ts:163](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-roles-editor.component.ts#L163)

##### Parameters

###### value

`string` \| `null` \| `undefined`

##### Returns

`void`

## Methods

### hasRole()

> `protected` **hasRole**(`id`): `boolean`

Defined in: [group-roles-editor.component.ts:174](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-roles-editor.component.ts#L174)

#### Parameters

##### id

`string`

#### Returns

`boolean`

---

### save()

> `protected` **save**(): `void`

Defined in: [group-roles-editor.component.ts:190](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-roles-editor.component.ts#L190)

#### Returns

`void`

---

### toggleRole()

> `protected` **toggleRole**(`id`): `void`

Defined in: [group-roles-editor.component.ts:178](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-roles-editor.component.ts#L178)

#### Parameters

##### id

`string`

#### Returns

`void`

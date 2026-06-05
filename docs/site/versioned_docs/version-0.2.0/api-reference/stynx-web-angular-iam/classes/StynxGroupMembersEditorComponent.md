[**@stynx-web/angular-iam**](../index.md)

---

[@stynx-web/angular-iam](../index.md) / StynxGroupMembersEditorComponent

# Class: StynxGroupMembersEditorComponent

Defined in: [group-members-editor.component.ts:198](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L198)

## Constructors

### Constructor

> **new StynxGroupMembersEditorComponent**(): `StynxGroupMembersEditorComponent`

#### Returns

`StynxGroupMembersEditorComponent`

## Properties

### assignedMemberIds

> `readonly` **assignedMemberIds**: `WritableSignal`\<`ReadonlySet`\<`string`\>\>

Defined in: [group-members-editor.component.ts:208](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L208)

---

### currentGroupId

> `readonly` **currentGroupId**: `WritableSignal`\<`string`\>

Defined in: [group-members-editor.component.ts:206](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L206)

---

### error

> `readonly` **error**: `WritableSignal`\<`string`\>

Defined in: [group-members-editor.component.ts:212](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L212)

---

### filteredUsers

> `readonly` **filteredUsers**: `Signal`\<[`StynxUser`](../interfaces/StynxUser.md)[]\>

Defined in: [group-members-editor.component.ts:214](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L214)

---

### loading

> `readonly` **loading**: `WritableSignal`\<`boolean`\>

Defined in: [group-members-editor.component.ts:210](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L210)

---

### membersChanged

> `readonly` **membersChanged**: `EventEmitter`\<`string`[]\>

Defined in: [group-members-editor.component.ts:204](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L204)

---

### saving

> `readonly` **saving**: `WritableSignal`\<`boolean`\>

Defined in: [group-members-editor.component.ts:211](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L211)

---

### searchForm

> `readonly` **searchForm**: `FormGroup`\<`ɵNonNullableFormControls`\<\{ `q`: `string`[]; \}\>\>

Defined in: [group-members-editor.component.ts:216](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L216)

---

### searchText

> `readonly` **searchText**: `WritableSignal`\<`string`\>

Defined in: [group-members-editor.component.ts:209](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L209)

---

### selectedMemberIds

> `readonly` **selectedMemberIds**: `Signal`\<`string`[]\>

Defined in: [group-members-editor.component.ts:213](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L213)

---

### users

> `readonly` **users**: `WritableSignal`\<[`StynxUser`](../interfaces/StynxUser.md)[]\>

Defined in: [group-members-editor.component.ts:207](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L207)

## Accessors

### groupId

#### Set Signature

> **set** **groupId**(`value`): `void`

Defined in: [group-members-editor.component.ts:221](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L221)

##### Parameters

###### value

`string` \| `null` \| `undefined`

##### Returns

`void`

## Methods

### clearSearch()

> `protected` **clearSearch**(): `void`

Defined in: [group-members-editor.component.ts:260](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L260)

#### Returns

`void`

---

### displayName()

> `protected` **displayName**(`user`): `string`

Defined in: [group-members-editor.component.ts:232](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L232)

#### Parameters

##### user

[`StynxUser`](../interfaces/StynxUser.md)

#### Returns

`string`

---

### hasMember()

> `protected` **hasMember**(`id`): `boolean`

Defined in: [group-members-editor.component.ts:240](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L240)

#### Parameters

##### id

`string`

#### Returns

`boolean`

---

### save()

> `protected` **save**(): `void`

Defined in: [group-members-editor.component.ts:265](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L265)

#### Returns

`void`

---

### search()

> `protected` **search**(): `void`

Defined in: [group-members-editor.component.ts:256](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L256)

#### Returns

`void`

---

### statusKey()

> `protected` **statusKey**(`user`): `string`

Defined in: [group-members-editor.component.ts:236](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L236)

#### Parameters

##### user

[`StynxUser`](../interfaces/StynxUser.md)

#### Returns

`string`

---

### toggleMember()

> `protected` **toggleMember**(`id`): `void`

Defined in: [group-members-editor.component.ts:244](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-members-editor.component.ts#L244)

#### Parameters

##### id

`string`

#### Returns

`void`

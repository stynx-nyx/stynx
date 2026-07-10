[**@stynx-nyx/angular-iam**](../index.md)

---

[@stynx-nyx/angular-iam](../index.md) / StynxGroupsAdminComponent

# Class: StynxGroupsAdminComponent

Defined in: [groups-admin.component.ts:280](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L280)

## Constructors

### Constructor

> **new StynxGroupsAdminComponent**(): `StynxGroupsAdminComponent`

Defined in: [groups-admin.component.ts:304](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L304)

#### Returns

`StynxGroupsAdminComponent`

## Properties

### actionSaving

> `readonly` **actionSaving**: `WritableSignal`\<`boolean`\>

Defined in: [groups-admin.component.ts:296](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L296)

---

### api

> `protected` `readonly` **api**: [`IamApiService`](IamApiService.md)

Defined in: [groups-admin.component.ts:281](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L281)

---

### createError

> `readonly` **createError**: `WritableSignal`\<`string`\>

Defined in: [groups-admin.component.ts:295](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L295)

---

### createOpen

> `readonly` **createOpen**: `WritableSignal`\<`boolean`\>

Defined in: [groups-admin.component.ts:293](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L293)

---

### createSaving

> `readonly` **createSaving**: `WritableSignal`\<`boolean`\>

Defined in: [groups-admin.component.ts:294](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L294)

---

### error

> `readonly` **error**: `WritableSignal`\<`string`\>

Defined in: [groups-admin.component.ts:291](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L291)

---

### filteredGroups

> `readonly` **filteredGroups**: `Signal`\<[`StynxGroup`](../interfaces/StynxGroup.md)[]\>

Defined in: [groups-admin.component.ts:302](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L302)

---

### groupSelected

> `readonly` **groupSelected**: `EventEmitter`\<[`StynxGroup`](../interfaces/StynxGroup.md)\>

Defined in: [groups-admin.component.ts:288](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L288)

---

### loading

> `readonly` **loading**: `WritableSignal`\<`boolean`\>

Defined in: [groups-admin.component.ts:290](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L290)

---

### searchForm

> `readonly` **searchForm**: `FormGroup`\<`ɵNonNullableFormControls`\<\{ `q`: `string`[]; \}\>\>

Defined in: [groups-admin.component.ts:298](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L298)

---

### searchText

> `readonly` **searchText**: `WritableSignal`\<`string`\>

Defined in: [groups-admin.component.ts:292](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L292)

## Methods

### clearSearch()

> `protected` **clearSearch**(): `void`

Defined in: [groups-admin.component.ts:312](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L312)

#### Returns

`void`

---

### closeCreateDialog()

> `protected` **closeCreateDialog**(): `void`

Defined in: [groups-admin.component.ts:322](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L322)

#### Returns

`void`

---

### createGroup()

> `protected` **createGroup**(`body`): `void`

Defined in: [groups-admin.component.ts:329](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L329)

#### Parameters

##### body

[`StynxCreateGroupRequest`](../interfaces/StynxCreateGroupRequest.md)

#### Returns

`void`

---

### deleteGroup()

> `protected` **deleteGroup**(`group`): `void`

Defined in: [groups-admin.component.ts:346](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L346)

#### Parameters

##### group

[`StynxGroup`](../interfaces/StynxGroup.md)

#### Returns

`void`

---

### openCreateDialog()

> `protected` **openCreateDialog**(): `void`

Defined in: [groups-admin.component.ts:317](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L317)

#### Returns

`void`

---

### openDetail()

> `protected` **openDetail**(`group`): `void`

Defined in: [groups-admin.component.ts:361](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L361)

#### Parameters

##### group

[`StynxGroup`](../interfaces/StynxGroup.md)

#### Returns

`void`

---

### search()

> `protected` **search**(): `void`

Defined in: [groups-admin.component.ts:308](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/groups-admin.component.ts#L308)

#### Returns

`void`

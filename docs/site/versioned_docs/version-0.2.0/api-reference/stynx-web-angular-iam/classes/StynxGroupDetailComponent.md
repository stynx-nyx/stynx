[**@stynx-nyx/angular-iam**](../index.md)

---

[@stynx-nyx/angular-iam](../index.md) / StynxGroupDetailComponent

# Class: StynxGroupDetailComponent

Defined in: [group-detail.component.ts:295](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-detail.component.ts#L295)

## Constructors

### Constructor

> **new StynxGroupDetailComponent**(): `StynxGroupDetailComponent`

#### Returns

`StynxGroupDetailComponent`

## Properties

### activeTab

> `readonly` **activeTab**: `WritableSignal`\<`GroupDetailTab`\>

Defined in: [group-detail.component.ts:310](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-detail.component.ts#L310)

---

### error

> `readonly` **error**: `WritableSignal`\<`string`\>

Defined in: [group-detail.component.ts:309](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-detail.component.ts#L309)

---

### group

> `readonly` **group**: `WritableSignal`\<[`StynxGroup`](../interfaces/StynxGroup.md) \| `null`\>

Defined in: [group-detail.component.ts:306](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-detail.component.ts#L306)

---

### groupChanged

> `readonly` **groupChanged**: `EventEmitter`\<[`StynxGroup`](../interfaces/StynxGroup.md)\>

Defined in: [group-detail.component.ts:301](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-detail.component.ts#L301)

---

### loading

> `readonly` **loading**: `WritableSignal`\<`boolean`\>

Defined in: [group-detail.component.ts:307](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-detail.component.ts#L307)

---

### membersChanged

> `readonly` **membersChanged**: `EventEmitter`\<`string`[]\>

Defined in: [group-detail.component.ts:303](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-detail.component.ts#L303)

---

### overviewForm

> `readonly` **overviewForm**: `FormGroup`\<`ɵNonNullableFormControls`\<\{ `description`: `string`[]; `key`: (`string` \| (`control`) => `ValidationErrors` \| `null`[])[]; `name`: (`string` \| (`control`) => `ValidationErrors` \| `null`[])[]; \}\>\>

Defined in: [group-detail.component.ts:312](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-detail.component.ts#L312)

---

### rolesChanged

> `readonly` **rolesChanged**: `EventEmitter`\<`string`[]\>

Defined in: [group-detail.component.ts:302](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-detail.component.ts#L302)

---

### saving

> `readonly` **saving**: `WritableSignal`\<`boolean`\>

Defined in: [group-detail.component.ts:308](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-detail.component.ts#L308)

---

### tabs

> `readonly` **tabs**: `GroupDetailTab`[]

Defined in: [group-detail.component.ts:305](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-detail.component.ts#L305)

## Accessors

### groupId

#### Set Signature

> **set** **groupId**(`value`): `void`

Defined in: [group-detail.component.ts:319](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-detail.component.ts#L319)

##### Parameters

###### value

`string` \| `null` \| `undefined`

##### Returns

`void`

## Methods

### saveOverview()

> `protected` **saveOverview**(): `void`

Defined in: [group-detail.component.ts:331](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-detail.component.ts#L331)

#### Returns

`void`

---

### tabKey()

> `protected` **tabKey**(`tab`): `string`

Defined in: [group-detail.component.ts:327](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/group-detail.component.ts#L327)

#### Parameters

##### tab

`GroupDetailTab`

#### Returns

`string`

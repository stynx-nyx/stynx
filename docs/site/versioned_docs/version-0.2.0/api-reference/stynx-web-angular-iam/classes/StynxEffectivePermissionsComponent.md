[**@stynx-nyx/angular-iam**](../index.md)

---

[@stynx-nyx/angular-iam](../index.md) / StynxEffectivePermissionsComponent

# Class: StynxEffectivePermissionsComponent

Defined in: [effective-permissions.component.ts:312](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/effective-permissions.component.ts#L312)

## Constructors

### Constructor

> **new StynxEffectivePermissionsComponent**(): `StynxEffectivePermissionsComponent`

#### Returns

`StynxEffectivePermissionsComponent`

## Properties

### currentUserId

> `readonly` **currentUserId**: `WritableSignal`\<`string`\>

Defined in: [effective-permissions.component.ts:319](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/effective-permissions.component.ts#L319)

---

### error

> `readonly` **error**: `WritableSignal`\<`string`\>

Defined in: [effective-permissions.component.ts:321](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/effective-permissions.component.ts#L321)

---

### filteredPermissions

> `readonly` **filteredPermissions**: `Signal`\<`EffectivePermissionView`[]\>

Defined in: [effective-permissions.component.ts:330](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/effective-permissions.component.ts#L330)

---

### filterForm

> `readonly` **filterForm**: `FormGroup`\<`ɵNonNullableFormControls`\<\{ `q`: `string`[]; \}\>\>

Defined in: [effective-permissions.component.ts:325](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/effective-permissions.component.ts#L325)

---

### grantSourceCount

> `readonly` **grantSourceCount**: `Signal`\<`number`\>

Defined in: [effective-permissions.component.ts:331](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/effective-permissions.component.ts#L331)

---

### loading

> `readonly` **loading**: `WritableSignal`\<`boolean`\>

Defined in: [effective-permissions.component.ts:320](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/effective-permissions.component.ts#L320)

---

### permissions

> `readonly` **permissions**: `Signal`\<`EffectivePermissionView`[]\>

Defined in: [effective-permissions.component.ts:329](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/effective-permissions.component.ts#L329)

---

### permissionsLoaded

> `readonly` **permissionsLoaded**: `EventEmitter`\<[`StynxEffectivePermissions`](../interfaces/StynxEffectivePermissions.md)\>

Defined in: [effective-permissions.component.ts:317](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/effective-permissions.component.ts#L317)

---

### permissionsSnapshot

> `readonly` **permissionsSnapshot**: `WritableSignal`\<[`StynxEffectivePermissions`](../interfaces/StynxEffectivePermissions.md)\>

Defined in: [effective-permissions.component.ts:323](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/effective-permissions.component.ts#L323)

---

### search

> `readonly` **search**: `WritableSignal`\<`string`\>

Defined in: [effective-permissions.component.ts:322](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/effective-permissions.component.ts#L322)

## Accessors

### userId

#### Set Signature

> **set** **userId**(`value`): `void`

Defined in: [effective-permissions.component.ts:334](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/effective-permissions.component.ts#L334)

##### Parameters

###### value

`string` \| `null` \| `undefined`

##### Returns

`void`

## Methods

### applySearch()

> `protected` **applySearch**(): `void`

Defined in: [effective-permissions.component.ts:347](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/effective-permissions.component.ts#L347)

#### Returns

`void`

---

### clearSearch()

> `protected` **clearSearch**(): `void`

Defined in: [effective-permissions.component.ts:351](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/effective-permissions.component.ts#L351)

#### Returns

`void`

---

### emptyDescriptionKey()

> `protected` **emptyDescriptionKey**(): `string`

Defined in: [effective-permissions.component.ts:369](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/effective-permissions.component.ts#L369)

#### Returns

`string`

---

### emptyTitleKey()

> `protected` **emptyTitleKey**(): `string`

Defined in: [effective-permissions.component.ts:363](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/effective-permissions.component.ts#L363)

#### Returns

`string`

---

### refresh()

> `protected` **refresh**(): `void`

Defined in: [effective-permissions.component.ts:356](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/effective-permissions.component.ts#L356)

#### Returns

`void`

---

### sourceTypeKey()

> `protected` **sourceTypeKey**(`type`): `string`

Defined in: [effective-permissions.component.ts:375](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/effective-permissions.component.ts#L375)

#### Parameters

##### type

`"role"` \| `"group"`

#### Returns

`string`

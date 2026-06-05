[**@stynx-web/angular-iam**](../index.md)

---

[@stynx-web/angular-iam](../index.md) / StynxPermissionMatrixComponent

# Class: StynxPermissionMatrixComponent

Defined in: [permission-matrix.component.ts:307](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L307)

## Constructors

### Constructor

> **new StynxPermissionMatrixComponent**(): `StynxPermissionMatrixComponent`

#### Returns

`StynxPermissionMatrixComponent`

## Properties

### allPermissions

> `readonly` **allPermissions**: `Signal`\<[`StynxPermission`](../interfaces/StynxPermission.md)[]\>

Defined in: [permission-matrix.component.ts:328](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L328)

---

### assignedKeys

> `readonly` **assignedKeys**: `WritableSignal`\<`ReadonlySet`\<`string`\>\>

Defined in: [permission-matrix.component.ts:320](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L320)

---

### currentRoleId

> `readonly` **currentRoleId**: `WritableSignal`\<`string`\>

Defined in: [permission-matrix.component.ts:315](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L315)

---

### dirty

> `readonly` **dirty**: `Signal`\<`boolean`\>

Defined in: [permission-matrix.component.ts:361](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L361)

---

### error

> `readonly` **error**: `WritableSignal`\<`string`\>

Defined in: [permission-matrix.component.ts:318](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L318)

---

### filteredPermissions

> `readonly` **filteredPermissions**: `Signal`\<[`StynxPermission`](../interfaces/StynxPermission.md)[]\>

Defined in: [permission-matrix.component.ts:344](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L344)

---

### filterForm

> `readonly` **filterForm**: `FormGroup`\<`ɵNonNullableFormControls`\<\{ `q`: `string`[]; \}\>\>

Defined in: [permission-matrix.component.ts:324](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L324)

---

### groups

> `readonly` **groups**: `Signal`\<`PermissionGroup`[]\>

Defined in: [permission-matrix.component.ts:346](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L346)

---

### loading

> `readonly` **loading**: `WritableSignal`\<`boolean`\>

Defined in: [permission-matrix.component.ts:316](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L316)

---

### originalKeys

> `readonly` **originalKeys**: `WritableSignal`\<`ReadonlySet`\<`string`\>\>

Defined in: [permission-matrix.component.ts:321](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L321)

---

### permissionCount

> `readonly` **permissionCount**: `Signal`\<`number`\>

Defined in: [permission-matrix.component.ts:359](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L359)

---

### permissionsChanged

> `readonly` **permissionsChanged**: `EventEmitter`\<`string`[]\>

Defined in: [permission-matrix.component.ts:313](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L313)

---

### rolePermissions

> `readonly` **rolePermissions**: `WritableSignal`\<[`StynxPermission`](../interfaces/StynxPermission.md)[]\>

Defined in: [permission-matrix.component.ts:322](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L322)

---

### saving

> `readonly` **saving**: `WritableSignal`\<`boolean`\>

Defined in: [permission-matrix.component.ts:317](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L317)

---

### search

> `readonly` **search**: `WritableSignal`\<`string`\>

Defined in: [permission-matrix.component.ts:319](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L319)

---

### selectedCount

> `readonly` **selectedCount**: `Signal`\<`number`\>

Defined in: [permission-matrix.component.ts:360](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L360)

## Accessors

### roleId

#### Set Signature

> **set** **roleId**(`value`): `void`

Defined in: [permission-matrix.component.ts:364](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L364)

##### Parameters

###### value

`string` \| `null` \| `undefined`

##### Returns

`void`

## Methods

### applySearch()

> `protected` **applySearch**(): `void`

Defined in: [permission-matrix.component.ts:375](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L375)

#### Returns

`void`

---

### clearResource()

> `protected` **clearResource**(`group`): `void`

Defined in: [permission-matrix.component.ts:410](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L410)

#### Parameters

##### group

`PermissionGroup`

#### Returns

`void`

---

### clearSearch()

> `protected` **clearSearch**(): `void`

Defined in: [permission-matrix.component.ts:379](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L379)

#### Returns

`void`

---

### dirtyKey()

> `protected` **dirtyKey**(): `string`

Defined in: [permission-matrix.component.ts:384](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L384)

#### Returns

`string`

---

### permissionSelected()

> `protected` **permissionSelected**(`key`): `boolean`

Defined in: [permission-matrix.component.ts:388](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L388)

#### Parameters

##### key

`string`

#### Returns

`boolean`

---

### save()

> `protected` **save**(): `void`

Defined in: [permission-matrix.component.ts:420](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L420)

#### Returns

`void`

---

### selectedInGroup()

> `protected` **selectedInGroup**(`group`): `number`

Defined in: [permission-matrix.component.ts:392](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L392)

#### Parameters

##### group

`PermissionGroup`

#### Returns

`number`

---

### selectResource()

> `protected` **selectResource**(`group`): `void`

Defined in: [permission-matrix.component.ts:400](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L400)

#### Parameters

##### group

`PermissionGroup`

#### Returns

`void`

---

### togglePermission()

> `protected` **togglePermission**(`key`): `void`

Defined in: [permission-matrix.component.ts:396](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/permission-matrix.component.ts#L396)

#### Parameters

##### key

`string`

#### Returns

`void`

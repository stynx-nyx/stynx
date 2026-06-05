[**@stynx-web/angular-iam**](../index.md)

---

[@stynx-web/angular-iam](../index.md) / StynxUserDetailComponent

# Class: StynxUserDetailComponent

Defined in: [user-detail.component.ts:454](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L454)

## Constructors

### Constructor

> **new StynxUserDetailComponent**(): `StynxUserDetailComponent`

#### Returns

`StynxUserDetailComponent`

## Properties

### activeTab

> `readonly` **activeTab**: `WritableSignal`\<`UserDetailTab`\>

Defined in: [user-detail.component.ts:474](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L474)

---

### assignedGroupIds

> `readonly` **assignedGroupIds**: `WritableSignal`\<`ReadonlySet`\<`string`\>\>

Defined in: [user-detail.component.ts:468](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L468)

---

### assignedRoleIds

> `readonly` **assignedRoleIds**: `WritableSignal`\<`ReadonlySet`\<`string`\>\>

Defined in: [user-detail.component.ts:467](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L467)

---

### currentUserId

> `readonly` **currentUserId**: `Signal`\<`string`\>

Defined in: [user-detail.component.ts:475](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L475)

---

### disableDialogOpen

> `readonly` **disableDialogOpen**: `WritableSignal`\<`boolean`\>

Defined in: [user-detail.component.ts:473](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L473)

---

### effectivePermissions

> `readonly` **effectivePermissions**: `WritableSignal`\<[`StynxEffectivePermissions`](../interfaces/StynxEffectivePermissions.md)\>

Defined in: [user-detail.component.ts:469](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L469)

---

### error

> `readonly` **error**: `WritableSignal`\<`string`\>

Defined in: [user-detail.component.ts:472](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L472)

---

### groups

> `readonly` **groups**: `WritableSignal`\<[`StynxGroup`](../interfaces/StynxGroup.md)[]\>

Defined in: [user-detail.component.ts:466](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L466)

---

### loading

> `readonly` **loading**: `WritableSignal`\<`boolean`\>

Defined in: [user-detail.component.ts:470](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L470)

---

### membershipChanged

> `readonly` **membershipChanged**: `EventEmitter`\<`void`\>

Defined in: [user-detail.component.ts:461](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L461)

---

### overviewForm

> `readonly` **overviewForm**: `FormGroup`\<`ɵNonNullableFormControls`\<\{ `email`: (`string` \| (`control`) => `ValidationErrors` \| `null`[])[]; `firstName`: `string`[]; `lastName`: `string`[]; `locale`: (`string` \| (`control`) => `ValidationErrors` \| `null`[])[]; \}\>\>

Defined in: [user-detail.component.ts:477](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L477)

---

### roles

> `readonly` **roles**: `WritableSignal`\<[`StynxRole`](../interfaces/StynxRole.md)[]\>

Defined in: [user-detail.component.ts:465](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L465)

---

### saving

> `readonly` **saving**: `WritableSignal`\<`boolean`\>

Defined in: [user-detail.component.ts:471](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L471)

---

### tabs

> `readonly` **tabs**: `UserDetailTab`[]

Defined in: [user-detail.component.ts:463](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L463)

---

### user

> `readonly` **user**: `WritableSignal`\<[`StynxUserDetail`](../interfaces/StynxUserDetail.md) \| `null`\>

Defined in: [user-detail.component.ts:464](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L464)

---

### userChanged

> `readonly` **userChanged**: `EventEmitter`\<[`StynxUserDetail`](../interfaces/StynxUserDetail.md)\>

Defined in: [user-detail.component.ts:460](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L460)

## Accessors

### userId

#### Set Signature

> **set** **userId**(`value`): `void`

Defined in: [user-detail.component.ts:485](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L485)

##### Parameters

###### value

`string` \| `null` \| `undefined`

##### Returns

`void`

## Methods

### disableUser()

> `protected` **disableUser**(): `void`

Defined in: [user-detail.component.ts:606](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L606)

#### Returns

`void`

---

### displayName()

> `protected` **displayName**(`user`): `string`

Defined in: [user-detail.component.ts:495](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L495)

#### Parameters

##### user

[`StynxUser`](../interfaces/StynxUser.md)

#### Returns

`string`

---

### forceLogout()

> `protected` **forceLogout**(): `void`

Defined in: [user-detail.component.ts:598](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L598)

#### Returns

`void`

---

### grantSourceKey()

> `protected` **grantSourceKey**(`type`): `string`

Defined in: [user-detail.component.ts:503](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L503)

#### Parameters

##### type

`"role"` \| `"group"`

#### Returns

`string`

---

### groupAssigned()

> `protected` **groupAssigned**(`id`): `boolean`

Defined in: [user-detail.component.ts:511](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L511)

#### Parameters

##### id

`string`

#### Returns

`boolean`

---

### reactivate()

> `protected` **reactivate**(): `void`

Defined in: [user-detail.component.ts:602](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L602)

#### Returns

`void`

---

### roleAssigned()

> `protected` **roleAssigned**(`id`): `boolean`

Defined in: [user-detail.component.ts:507](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L507)

#### Parameters

##### id

`string`

#### Returns

`boolean`

---

### saveGroups()

> `protected` **saveGroups**(): `void`

Defined in: [user-detail.component.ts:577](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L577)

#### Returns

`void`

---

### saveOverview()

> `protected` **saveOverview**(): `void`

Defined in: [user-detail.component.ts:523](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L523)

#### Returns

`void`

---

### saveRoles()

> `protected` **saveRoles**(): `void`

Defined in: [user-detail.component.ts:560](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L560)

#### Returns

`void`

---

### sendInvite()

> `protected` **sendInvite**(): `void`

Defined in: [user-detail.component.ts:594](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L594)

#### Returns

`void`

---

### statusKey()

> `protected` **statusKey**(`user`): `string`

Defined in: [user-detail.component.ts:499](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L499)

#### Parameters

##### user

[`StynxUser`](../interfaces/StynxUser.md)

#### Returns

`string`

---

### tabKey()

> `protected` **tabKey**(`tab`): `string`

Defined in: [user-detail.component.ts:491](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L491)

#### Parameters

##### tab

`UserDetailTab`

#### Returns

`string`

---

### toggleGroup()

> `protected` **toggleGroup**(`id`): `void`

Defined in: [user-detail.component.ts:519](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L519)

#### Parameters

##### id

`string`

#### Returns

`void`

---

### toggleRole()

> `protected` **toggleRole**(`id`): `void`

Defined in: [user-detail.component.ts:515](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-iam/src/user-detail.component.ts#L515)

#### Parameters

##### id

`string`

#### Returns

`void`

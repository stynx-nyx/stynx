[**@stynx-nyx/angular-profile**](../index.md)

---

[@stynx-nyx/angular-profile](../index.md) / StynxProfileFormComponent

# Class: StynxProfileFormComponent

Defined in: [profile-form.component.ts:158](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/profile-form.component.ts#L158)

## Implements

- `OnDestroy`
- [`StynxUnsavedChangesAware`](../interfaces/StynxUnsavedChangesAware.md)

## Constructors

### Constructor

> **new StynxProfileFormComponent**(): `StynxProfileFormComponent`

#### Returns

`StynxProfileFormComponent`

## Properties

### errorMessage

> `readonly` **errorMessage**: `WritableSignal`\<`string`\>

Defined in: [profile-form.component.ts:167](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/profile-form.component.ts#L167)

---

### save

> `readonly` **save**: `EventEmitter`\<[`StynxProfileValue`](../interfaces/StynxProfileValue.md)\>

Defined in: [profile-form.component.ts:177](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/profile-form.component.ts#L177)

---

### status

> `readonly` **status**: `WritableSignal`\<[`StynxProfileFormStatus`](../type-aliases/StynxProfileFormStatus.md)\>

Defined in: [profile-form.component.ts:166](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/profile-form.component.ts#L166)

## Accessors

### value

#### Set Signature

> **set** **value**(`value`): `void`

Defined in: [profile-form.component.ts:180](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/profile-form.component.ts#L180)

##### Parameters

###### value

[`StynxProfileValue`](../interfaces/StynxProfileValue.md) \| [`StynxProfile`](../interfaces/StynxProfile.md) \| `null`

##### Returns

`void`

## Methods

### confirmDiscardChanges()

> **confirmDiscardChanges**(): `boolean`

Defined in: [profile-form.component.ts:239](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/profile-form.component.ts#L239)

#### Returns

`boolean`

#### Implementation of

[`StynxUnsavedChangesAware`](../interfaces/StynxUnsavedChangesAware.md).[`confirmDiscardChanges`](../interfaces/StynxUnsavedChangesAware.md#confirmdiscardchanges)

---

### hasUnsavedChanges()

> **hasUnsavedChanges**(): `boolean`

Defined in: [profile-form.component.ts:235](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/profile-form.component.ts#L235)

#### Returns

`boolean`

#### Implementation of

[`StynxUnsavedChangesAware`](../interfaces/StynxUnsavedChangesAware.md).[`hasUnsavedChanges`](../interfaces/StynxUnsavedChangesAware.md#hasunsavedchanges)

---

### ngOnDestroy()

> **ngOnDestroy**(): `void`

Defined in: [profile-form.component.ts:231](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/profile-form.component.ts#L231)

A callback method that performs custom clean-up, invoked immediately
before a directive, pipe, or service instance is destroyed.

#### Returns

`void`

#### Implementation of

`OnDestroy.ngOnDestroy`

---

### submit()

> **submit**(): `void`

Defined in: [profile-form.component.ts:187](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/profile-form.component.ts#L187)

#### Returns

`void`

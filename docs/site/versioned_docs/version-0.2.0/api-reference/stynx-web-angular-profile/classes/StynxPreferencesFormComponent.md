[**@stynx-nyx/angular-profile**](../index.md)

---

[@stynx-nyx/angular-profile](../index.md) / StynxPreferencesFormComponent

# Class: StynxPreferencesFormComponent

Defined in: [preferences-form.component.ts:159](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/preferences-form.component.ts#L159)

## Implements

- `OnDestroy`
- [`StynxUnsavedChangesAware`](../interfaces/StynxUnsavedChangesAware.md)

## Constructors

### Constructor

> **new StynxPreferencesFormComponent**(): `StynxPreferencesFormComponent`

#### Returns

`StynxPreferencesFormComponent`

## Properties

### errorMessage

> `readonly` **errorMessage**: `WritableSignal`\<`string`\>

Defined in: [preferences-form.component.ts:168](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/preferences-form.component.ts#L168)

---

### save

> `readonly` **save**: `EventEmitter`\<[`StynxPreferencesValue`](../interfaces/StynxPreferencesValue.md)\>

Defined in: [preferences-form.component.ts:178](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/preferences-form.component.ts#L178)

---

### status

> `readonly` **status**: `WritableSignal`\<[`StynxPreferencesFormStatus`](../type-aliases/StynxPreferencesFormStatus.md)\>

Defined in: [preferences-form.component.ts:167](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/preferences-form.component.ts#L167)

## Accessors

### value

#### Set Signature

> **set** **value**(`value`): `void`

Defined in: [preferences-form.component.ts:181](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/preferences-form.component.ts#L181)

##### Parameters

###### value

[`StynxPreferencesValue`](../interfaces/StynxPreferencesValue.md) \| [`StynxPreferences`](../interfaces/StynxPreferences.md) \| `null`

##### Returns

`void`

## Methods

### confirmDiscardChanges()

> **confirmDiscardChanges**(): `boolean`

Defined in: [preferences-form.component.ts:234](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/preferences-form.component.ts#L234)

#### Returns

`boolean`

#### Implementation of

[`StynxUnsavedChangesAware`](../interfaces/StynxUnsavedChangesAware.md).[`confirmDiscardChanges`](../interfaces/StynxUnsavedChangesAware.md#confirmdiscardchanges)

---

### hasUnsavedChanges()

> **hasUnsavedChanges**(): `boolean`

Defined in: [preferences-form.component.ts:230](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/preferences-form.component.ts#L230)

#### Returns

`boolean`

#### Implementation of

[`StynxUnsavedChangesAware`](../interfaces/StynxUnsavedChangesAware.md).[`hasUnsavedChanges`](../interfaces/StynxUnsavedChangesAware.md#hasunsavedchanges)

---

### ngOnDestroy()

> **ngOnDestroy**(): `void`

Defined in: [preferences-form.component.ts:226](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/preferences-form.component.ts#L226)

A callback method that performs custom clean-up, invoked immediately
before a directive, pipe, or service instance is destroyed.

#### Returns

`void`

#### Implementation of

`OnDestroy.ngOnDestroy`

---

### submit()

> **submit**(): `void`

Defined in: [preferences-form.component.ts:188](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/preferences-form.component.ts#L188)

#### Returns

`void`

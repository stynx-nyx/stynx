[**@stynx-web/angular-profile**](../index.md)

---

[@stynx-web/angular-profile](../index.md) / UnsavedChangesGuard

# Class: UnsavedChangesGuard

Defined in: [unsaved-changes.guard.ts:57](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/unsaved-changes.guard.ts#L57)

## Implements

- `CanDeactivate`\<[`StynxUnsavedChangesAware`](../interfaces/StynxUnsavedChangesAware.md)\>

## Constructors

### Constructor

> **new UnsavedChangesGuard**(): `UnsavedChangesGuard`

#### Returns

`UnsavedChangesGuard`

## Methods

### canDeactivate()

> **canDeactivate**(`component`): `boolean` \| `Promise`\<`boolean`\> \| `Observable`\<`boolean`\>

Defined in: [unsaved-changes.guard.ts:60](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/unsaved-changes.guard.ts#L60)

#### Parameters

##### component

[`StynxUnsavedChangesAware`](../interfaces/StynxUnsavedChangesAware.md)

#### Returns

`boolean` \| `Promise`\<`boolean`\> \| `Observable`\<`boolean`\>

#### Implementation of

`CanDeactivate.canDeactivate`

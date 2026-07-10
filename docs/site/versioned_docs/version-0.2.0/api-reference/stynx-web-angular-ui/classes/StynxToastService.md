[**@stynx-nyx/angular-ui**](../index.md)

---

[@stynx-nyx/angular-ui](../index.md) / StynxToastService

# Class: StynxToastService

Defined in: [angular-ui/src/toast.service.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-ui/src/toast.service.ts#L12)

## Constructors

### Constructor

> **new StynxToastService**(): `StynxToastService`

#### Returns

`StynxToastService`

## Properties

### toasts

> `readonly` **toasts**: `Signal`\<[`StynxToast`](../interfaces/StynxToast.md)[]\>

Defined in: [angular-ui/src/toast.service.ts:15](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-ui/src/toast.service.ts#L15)

---

### ~~toasts$~~

> `readonly` **toasts$**: `Observable`\<[`StynxToast`](../interfaces/StynxToast.md)[]\>

Defined in: [angular-ui/src/toast.service.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-ui/src/toast.service.ts#L19)

#### Deprecated

since: 1.x — use toObservable(this.toasts) or the signal directly.

## Methods

### clear()

> **clear**(): `void`

Defined in: [angular-ui/src/toast.service.ts:45](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-ui/src/toast.service.ts#L45)

#### Returns

`void`

---

### dismiss()

> **dismiss**(`id`): `void`

Defined in: [angular-ui/src/toast.service.ts:41](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-ui/src/toast.service.ts#L41)

#### Parameters

##### id

`number`

#### Returns

`void`

---

### push()

> **push**(`message`, `tone?`, `ttlMs?`): [`StynxToast`](../interfaces/StynxToast.md)

Defined in: [angular-ui/src/toast.service.ts:24](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-ui/src/toast.service.ts#L24)

#### Parameters

##### message

`string`

##### tone?

`"error"` \| `"info"` \| `"warning"` \| `"success"`

##### ttlMs?

`number` = `5000`

#### Returns

[`StynxToast`](../interfaces/StynxToast.md)

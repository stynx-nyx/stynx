[**@stynx-web/angular**](../index.md)

---

[@stynx-web/angular](../index.md) / ToastService

# Class: ToastService

Defined in: [angular/src/toast.service.ts:7](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/toast.service.ts#L7)

## Constructors

### Constructor

> **new ToastService**(): `ToastService`

#### Returns

`ToastService`

## Properties

### messages

> `readonly` **messages**: `Signal`\<[`ToastMessage`](../interfaces/ToastMessage.md)[]\>

Defined in: [angular/src/toast.service.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/toast.service.ts#L9)

---

### ~~messages$~~

> `readonly` **messages$**: `Observable`\<[`ToastMessage`](../interfaces/ToastMessage.md)[]\>

Defined in: [angular/src/toast.service.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/toast.service.ts#L13)

#### Deprecated

since: 1.x — use toObservable(this.messages) or the signal directly.

## Methods

### clear()

> **clear**(): `void`

Defined in: [angular/src/toast.service.ts:28](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/toast.service.ts#L28)

#### Returns

`void`

---

### push()

> **push**(`message`): `string`

Defined in: [angular/src/toast.service.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/toast.service.ts#L18)

#### Parameters

##### message

`Omit`\<[`ToastMessage`](../interfaces/ToastMessage.md), `"id"`\>

#### Returns

`string`

---

### remove()

> **remove**(`id`): `void`

Defined in: [angular/src/toast.service.ts:24](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/toast.service.ts#L24)

#### Parameters

##### id

`string`

#### Returns

`void`

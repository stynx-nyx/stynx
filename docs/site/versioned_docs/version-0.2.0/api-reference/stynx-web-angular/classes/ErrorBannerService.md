[**@stynx-nyx/angular**](../index.md)

---

[@stynx-nyx/angular](../index.md) / ErrorBannerService

# Class: ErrorBannerService

Defined in: [angular/src/error-banner.service.ts:8](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/error-banner.service.ts#L8)

## Constructors

### Constructor

> **new ErrorBannerService**(): `ErrorBannerService`

#### Returns

`ErrorBannerService`

## Properties

### current

> `readonly` **current**: `Signal`\<[`ErrorBannerState`](../interfaces/ErrorBannerState.md) \| `null`\>

Defined in: [angular/src/error-banner.service.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/error-banner.service.ts#L11)

---

### ~~current$~~

> `readonly` **current$**: `Observable`\<[`ErrorBannerState`](../interfaces/ErrorBannerState.md) \| `null`\>

Defined in: [angular/src/error-banner.service.ts:15](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/error-banner.service.ts#L15)

#### Deprecated

since: 1.x — use toObservable(this.current) or the signal directly.

## Methods

### clear()

> **clear**(): `void`

Defined in: [angular/src/error-banner.service.ts:24](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/error-banner.service.ts#L24)

#### Returns

`void`

---

### show()

> **show**(`error`): `void`

Defined in: [angular/src/error-banner.service.ts:20](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/error-banner.service.ts#L20)

#### Parameters

##### error

[`ErrorBannerState`](../interfaces/ErrorBannerState.md)

#### Returns

`void`

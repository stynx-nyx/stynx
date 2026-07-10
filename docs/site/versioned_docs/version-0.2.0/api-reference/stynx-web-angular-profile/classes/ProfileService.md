[**@stynx-nyx/angular-profile**](../index.md)

---

[@stynx-nyx/angular-profile](../index.md) / ProfileService

# Class: ProfileService

Defined in: [profile.service.ts:15](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/profile.service.ts#L15)

## Constructors

### Constructor

> **new ProfileService**(): `ProfileService`

#### Returns

`ProfileService`

## Properties

### preferences

> `readonly` **preferences**: `WritableSignal`\<[`StynxPreferences`](../interfaces/StynxPreferences.md) \| `null`\>

Defined in: [profile.service.ts:23](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/profile.service.ts#L23)

---

### profile

> `readonly` **profile**: `WritableSignal`\<[`StynxProfile`](../interfaces/StynxProfile.md) \| `null`\>

Defined in: [profile.service.ts:22](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/profile.service.ts#L22)

## Methods

### patch()

> **patch**(`diff`): `Observable`\<[`StynxProfile`](../interfaces/StynxProfile.md)\>

Defined in: [profile.service.ts:40](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/profile.service.ts#L40)

#### Parameters

##### diff

`Partial`\<[`StynxProfile`](../interfaces/StynxProfile.md)\>

#### Returns

`Observable`\<[`StynxProfile`](../interfaces/StynxProfile.md)\>

---

### reload()

> **reload**(): `Observable`\<[`StynxProfile`](../interfaces/StynxProfile.md)\>

Defined in: [profile.service.ts:25](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/profile.service.ts#L25)

#### Returns

`Observable`\<[`StynxProfile`](../interfaces/StynxProfile.md)\>

---

### setPreferences()

> **setPreferences**(`preferences`): `Observable`\<[`StynxPreferences`](../interfaces/StynxPreferences.md)\>

Defined in: [profile.service.ts:55](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/profile.service.ts#L55)

#### Parameters

##### preferences

[`StynxPreferences`](../interfaces/StynxPreferences.md)

#### Returns

`Observable`\<[`StynxPreferences`](../interfaces/StynxPreferences.md)\>

---

### uploadAvatar()

> **uploadAvatar**(`file`): `Observable`\<[`StynxAvatarUploadResult`](../interfaces/StynxAvatarUploadResult.md)\>

Defined in: [profile.service.ts:68](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-profile/src/profile.service.ts#L68)

#### Parameters

##### file

`File`

#### Returns

`Observable`\<[`StynxAvatarUploadResult`](../interfaces/StynxAvatarUploadResult.md)\>

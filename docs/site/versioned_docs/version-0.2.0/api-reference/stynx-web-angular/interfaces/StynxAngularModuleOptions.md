[**@stynx-nyx/angular**](../index.md)

---

[@stynx-nyx/angular](../index.md) / StynxAngularModuleOptions

# Interface: StynxAngularModuleOptions

Defined in: [angular/src/types.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/types.ts#L13)

## Properties

### apiBaseUrl

> **apiBaseUrl**: `string`

Defined in: [angular/src/types.ts:14](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/types.ts#L14)

---

### authProvider?

> `optional` **authProvider?**: `AuthProvider`

Defined in: [angular/src/types.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/types.ts#L17)

---

### cognito?

> `optional` **cognito?**: [`StynxAngularCognitoConfig`](StynxAngularCognitoConfig.md)

Defined in: [angular/src/types.ts:15](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/types.ts#L15)

---

### cspNonce?

> `optional` **cspNonce?**: `string`

Defined in: [angular/src/types.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/types.ts#L19)

---

### defaultTenantResolver?

> `optional` **defaultTenantResolver?**: (`context`) => `string` \| `Promise`\<`string` \| `null`\> \| `null`

Defined in: [angular/src/types.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/types.ts#L18)

#### Parameters

##### context

`TenantResolutionContext`

#### Returns

`string` \| `Promise`\<`string` \| `null`\> \| `null`

---

### sessionMode

> **sessionMode**: [`SessionMode`](../type-aliases/SessionMode.md)

Defined in: [angular/src/types.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular/src/types.ts#L16)

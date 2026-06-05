[**@stynx-web/angular-tenancy**](../index.md)

---

[@stynx-web/angular-tenancy](../index.md) / StynxTenantPickerComponent

# Class: StynxTenantPickerComponent

Defined in: [tenant-picker.component.ts:48](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-picker.component.ts#L48)

## Constructors

### Constructor

> **new StynxTenantPickerComponent**(): `StynxTenantPickerComponent`

#### Returns

`StynxTenantPickerComponent`

## Properties

### availableTenants

> `readonly` **availableTenants**: `Signal`\<readonly [`TenantOption`](../interfaces/TenantOption.md)[]\>

Defined in: [tenant-picker.component.ts:63](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-picker.component.ts#L63)

---

### resolvedLabels

> `readonly` **resolvedLabels**: `Signal`\<\{ `availableTenants`: `string`; `description`: `string`; `title`: `string`; \}\>

Defined in: [tenant-picker.component.ts:64](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-picker.component.ts#L64)

---

### selectedTenantId

> `readonly` **selectedTenantId**: `WritableSignal`\<`string` \| `null`\>

Defined in: [tenant-picker.component.ts:62](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-picker.component.ts#L62)

---

### shouldRenderPicker

> `readonly` **shouldRenderPicker**: `Signal`\<`boolean`\>

Defined in: [tenant-picker.component.ts:65](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-picker.component.ts#L65)

---

### tenantChange

> `readonly` **tenantChange**: `EventEmitter`\<`string`\>

Defined in: [tenant-picker.component.ts:60](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-picker.component.ts#L60)

---

### tenantContext

> `readonly` **tenantContext**: [`TenantContextService`](TenantContextService.md)

Defined in: [tenant-picker.component.ts:61](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-picker.component.ts#L61)

## Accessors

### labels

#### Set Signature

> **set** **labels**(`value`): `void`

Defined in: [tenant-picker.component.ts:56](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-picker.component.ts#L56)

##### Parameters

###### value

`Partial`\<[`TenantPickerLabels`](../interfaces/TenantPickerLabels.md)\> \| `null` \| `undefined`

##### Returns

`void`

---

### tenants

#### Set Signature

> **set** **tenants**(`value`): `void`

Defined in: [tenant-picker.component.ts:52](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-picker.component.ts#L52)

##### Parameters

###### value

readonly [`TenantOption`](../interfaces/TenantOption.md)[] \| `null` \| `undefined`

##### Returns

`void`

## Methods

### selectTenant()

> **selectTenant**(`tenant`): `void`

Defined in: [tenant-picker.component.ts:67](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-tenancy/src/tenant-picker.component.ts#L67)

#### Parameters

##### tenant

[`TenantOption`](../interfaces/TenantOption.md)

#### Returns

`void`

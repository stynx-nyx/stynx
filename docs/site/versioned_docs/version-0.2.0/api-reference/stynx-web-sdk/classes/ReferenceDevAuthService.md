[**@stynx-web/sdk**](../index.md)

---

[@stynx-web/sdk](../index.md) / ReferenceDevAuthService

# Class: ReferenceDevAuthService

Defined in: [packages-web/sdk/src/generated/services/ReferenceDevAuthService.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/ReferenceDevAuthService.ts#L12)

## Constructors

### Constructor

> **new ReferenceDevAuthService**(`httpRequest`): `ReferenceDevAuthService`

Defined in: [packages-web/sdk/src/generated/services/ReferenceDevAuthService.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/ReferenceDevAuthService.ts#L13)

#### Parameters

##### httpRequest

[`BaseHttpRequest`](BaseHttpRequest.md)

#### Returns

`ReferenceDevAuthService`

## Properties

### httpRequest

> `readonly` **httpRequest**: [`BaseHttpRequest`](BaseHttpRequest.md)

Defined in: [packages-web/sdk/src/generated/services/ReferenceDevAuthService.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/ReferenceDevAuthService.ts#L13)

## Methods

### referenceDevAuthGetReferenceAuthVerifyHandler()

> **referenceDevAuthGetReferenceAuthVerifyHandler**(): [`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

Defined in: [packages-web/sdk/src/generated/services/ReferenceDevAuthService.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/ReferenceDevAuthService.ts#L19)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`JsonValue`](../type-aliases/JsonValue.md) \| [`ProblemDetails`](../type-aliases/ProblemDetails.md)\>

JsonValue OK

#### Throws

ApiError

---

### referenceDevAuthGetReferenceDemoTenantsListDemoTenants()

> **referenceDevAuthGetReferenceDemoTenantsListDemoTenants**(): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`DemoTenant`](../type-aliases/DemoTenant.md)[]\>

Defined in: [packages-web/sdk/src/generated/services/ReferenceDevAuthService.ts:36](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/ReferenceDevAuthService.ts#L36)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`DemoTenant`](../type-aliases/DemoTenant.md)[]\>

DemoTenant OK

#### Throws

ApiError

---

### referenceDevAuthPostReferenceDevLoginLogin()

> **referenceDevAuthPostReferenceDevLoginLogin**(`__namedParameters`): [`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`SessionBundle`](../type-aliases/SessionBundle.md) & `object`\>

Defined in: [packages-web/sdk/src/generated/services/ReferenceDevAuthService.ts:53](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/services/ReferenceDevAuthService.ts#L53)

#### Parameters

##### \_\_namedParameters

###### requestBody

[`DevLoginBody`](../type-aliases/DevLoginBody.md)

#### Returns

[`CancelablePromise`](CancelablePromise.md)\<[`ProblemDetails`](../type-aliases/ProblemDetails.md) \| [`SessionBundle`](../type-aliases/SessionBundle.md) & `object`\>

any OK

#### Throws

ApiError

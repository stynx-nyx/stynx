[**@stynx/auth**](../index.md)

---

[@stynx/auth](../index.md) / PermissionQueryService

# Class: PermissionQueryService

Defined in: [permission-query.service.ts:25](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/permission-query.service.ts#L25)

## Constructors

### Constructor

> **new PermissionQueryService**(`moduleRef`): `PermissionQueryService`

Defined in: [permission-query.service.ts:26](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/permission-query.service.ts#L26)

#### Parameters

##### moduleRef

`ModuleRef`

#### Returns

`PermissionQueryService`

## Methods

### probeHash()

> **probeHash**(`userId`, `tenantId`): `Promise`\<\{ `generation`: `number`; `hash`: `string` \| `null`; \}\>

Defined in: [permission-query.service.ts:93](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/permission-query.service.ts#L93)

#### Parameters

##### userId

`string`

##### tenantId

`string`

#### Returns

`Promise`\<\{ `generation`: `number`; `hash`: `string` \| `null`; \}\>

---

### resolveForUser()

> **resolveForUser**(`userId`, `tenantId`): `Promise`\<[`ResolvedPermissionState`](../interfaces/ResolvedPermissionState.md)\>

Defined in: [permission-query.service.ts:28](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/permission-query.service.ts#L28)

#### Parameters

##### userId

`string`

##### tenantId

`string`

#### Returns

`Promise`\<[`ResolvedPermissionState`](../interfaces/ResolvedPermissionState.md)\>

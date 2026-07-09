[**@stynx-nyx/backend**](../index.md)

---

[@stynx-nyx/backend](../index.md) / PgTenantDbClientLifecycle

# Class: PgTenantDbClientLifecycle

Defined in: [packages/backend/src/db-context/request-db-client-lifecycle.ts:36](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/request-db-client-lifecycle.ts#L36)

Convenience lifecycle matching PEC's `connectWithTenant(...)` + `client.release()`.

## Implements

- [`RequestDbClientLifecycle`](../interfaces/RequestDbClientLifecycle.md)

## Constructors

### Constructor

> **new PgTenantDbClientLifecycle**(`factory`, `options?`): `PgTenantDbClientLifecycle`

Defined in: [packages/backend/src/db-context/request-db-client-lifecycle.ts:39](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/request-db-client-lifecycle.ts#L39)

#### Parameters

##### factory

[`TenantBoundDbClientFactory`](../interfaces/TenantBoundDbClientFactory.md)

##### options?

[`PgTenantDbClientLifecycleOptions`](../interfaces/PgTenantDbClientLifecycleOptions.md) = `{}`

#### Returns

`PgTenantDbClientLifecycle`

## Methods

### acquire()

> **acquire**(`context`): `Promise`\<`unknown`\>

Defined in: [packages/backend/src/db-context/request-db-client-lifecycle.ts:46](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/request-db-client-lifecycle.ts#L46)

#### Parameters

##### context

[`RequestDbClientAcquireContext`](../interfaces/RequestDbClientAcquireContext.md)

#### Returns

`Promise`\<`unknown`\>

#### Implementation of

[`RequestDbClientLifecycle`](../interfaces/RequestDbClientLifecycle.md).[`acquire`](../interfaces/RequestDbClientLifecycle.md#acquire)

---

### release()

> **release**(`context`): `Promise`\<`void`\>

Defined in: [packages/backend/src/db-context/request-db-client-lifecycle.ts:50](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/backend/src/db-context/request-db-client-lifecycle.ts#L50)

#### Parameters

##### context

[`RequestDbClientReleaseContext`](../interfaces/RequestDbClientReleaseContext.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`RequestDbClientLifecycle`](../interfaces/RequestDbClientLifecycle.md).[`release`](../interfaces/RequestDbClientLifecycle.md#release)

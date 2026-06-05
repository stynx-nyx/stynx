[**@stynx/tenancy**](../index.md)

---

[@stynx/tenancy](../index.md) / TenantSystemOperationSink

# Class: TenantSystemOperationSink

Defined in: [tenant-system-operation.sink.ts:7](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenant-system-operation.sink.ts#L7)

## Implements

- `SystemOperationSink`

## Constructors

### Constructor

> **new TenantSystemOperationSink**(`moduleRef`): `TenantSystemOperationSink`

Defined in: [tenant-system-operation.sink.ts:8](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenant-system-operation.sink.ts#L8)

#### Parameters

##### moduleRef

`ModuleRef`

#### Returns

`TenantSystemOperationSink`

## Methods

### write()

> **write**(`record`): `Promise`\<`void`\>

Defined in: [tenant-system-operation.sink.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/tenancy/src/tenant-system-operation.sink.ts#L10)

#### Parameters

##### record

`SystemOperationRecord`

#### Returns

`Promise`\<`void`\>

#### Implementation of

`SystemOperationSink.write`

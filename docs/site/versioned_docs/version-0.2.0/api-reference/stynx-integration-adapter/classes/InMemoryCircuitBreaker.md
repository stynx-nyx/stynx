[**@stynx-nyx/integration-adapter**](../index.md)

---

[@stynx-nyx/integration-adapter](../index.md) / InMemoryCircuitBreaker

# Class: InMemoryCircuitBreaker

Defined in: [index.ts:84](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/index.ts#L84)

## Implements

- [`CircuitBreaker`](../interfaces/CircuitBreaker.md)

## Constructors

### Constructor

> **new InMemoryCircuitBreaker**(`policy?`, `now?`): `InMemoryCircuitBreaker`

Defined in: [index.ts:87](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/index.ts#L87)

#### Parameters

##### policy?

[`CircuitBreakerPolicy`](../interfaces/CircuitBreakerPolicy.md) = `DEFAULT_CIRCUIT_POLICY`

##### now?

() => `number`

#### Returns

`InMemoryCircuitBreaker`

## Methods

### beforeRequest()

> **beforeRequest**(`key`): `Promise`\<[`CircuitSnapshot`](../interfaces/CircuitSnapshot.md)\>

Defined in: [index.ts:92](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/index.ts#L92)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<[`CircuitSnapshot`](../interfaces/CircuitSnapshot.md)\>

#### Implementation of

[`CircuitBreaker`](../interfaces/CircuitBreaker.md).[`beforeRequest`](../interfaces/CircuitBreaker.md#beforerequest)

---

### recordFailure()

> **recordFailure**(`key`): `Promise`\<[`CircuitSnapshot`](../interfaces/CircuitSnapshot.md)\>

Defined in: [index.ts:114](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/index.ts#L114)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<[`CircuitSnapshot`](../interfaces/CircuitSnapshot.md)\>

#### Implementation of

[`CircuitBreaker`](../interfaces/CircuitBreaker.md).[`recordFailure`](../interfaces/CircuitBreaker.md#recordfailure)

---

### recordSuccess()

> **recordSuccess**(`key`): `Promise`\<`void`\>

Defined in: [index.ts:106](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/index.ts#L106)

#### Parameters

##### key

`string`

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`CircuitBreaker`](../interfaces/CircuitBreaker.md).[`recordSuccess`](../interfaces/CircuitBreaker.md#recordsuccess)

---

### snapshot()

> **snapshot**(`key`): [`CircuitSnapshot`](../interfaces/CircuitSnapshot.md)

Defined in: [index.ts:128](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/integration-adapter/src/index.ts#L128)

#### Parameters

##### key

`string`

#### Returns

[`CircuitSnapshot`](../interfaces/CircuitSnapshot.md)

#### Implementation of

[`CircuitBreaker`](../interfaces/CircuitBreaker.md).[`snapshot`](../interfaces/CircuitBreaker.md#snapshot)

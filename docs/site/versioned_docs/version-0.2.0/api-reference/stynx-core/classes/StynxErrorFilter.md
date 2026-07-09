[**@stynx-nyx/core**](../index.md)

---

[@stynx-nyx/core](../index.md) / StynxErrorFilter

# Class: StynxErrorFilter

Defined in: [packages/core/src/error.filter.ts:19](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/error.filter.ts#L19)

## Implements

- `ExceptionFilter`

## Constructors

### Constructor

> **new StynxErrorFilter**(`moduleRef`): `StynxErrorFilter`

Defined in: [packages/core/src/error.filter.ts:22](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/error.filter.ts#L22)

#### Parameters

##### moduleRef

`ModuleRef`

#### Returns

`StynxErrorFilter`

## Methods

### catch()

> **catch**(`exception`, `host`): `void`

Defined in: [packages/core/src/error.filter.ts:24](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/core/src/error.filter.ts#L24)

Method to implement a custom exception filter.

#### Parameters

##### exception

`unknown`

the class of the exception being handled

##### host

`ArgumentsHost`

used to access an array of arguments for
the in-flight request

#### Returns

`void`

#### Implementation of

`ExceptionFilter.catch`

[**@stynx-nyx/pdf-a**](../index.md)

---

[@stynx-nyx/pdf-a](../index.md) / NoopPdfAValidator

# Class: NoopPdfAValidator

Defined in: [stubs/noop.ts:4](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf-a/src/stubs/noop.ts#L4)

## Implements

- [`PdfAValidator`](../interfaces/PdfAValidator.md)

## Constructors

### Constructor

> **new NoopPdfAValidator**(): `NoopPdfAValidator`

#### Returns

`NoopPdfAValidator`

## Methods

### validate()

> **validate**(`_pdf`, `opts?`): `Promise`\<[`PdfAValidationResult`](../interfaces/PdfAValidationResult.md)\>

Defined in: [stubs/noop.ts:5](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf-a/src/stubs/noop.ts#L5)

#### Parameters

##### \_pdf

`Uint8Array`

##### opts?

[`PdfAValidateOptions`](../interfaces/PdfAValidateOptions.md) = `{}`

#### Returns

`Promise`\<[`PdfAValidationResult`](../interfaces/PdfAValidationResult.md)\>

#### Implementation of

[`PdfAValidator`](../interfaces/PdfAValidator.md).[`validate`](../interfaces/PdfAValidator.md#validate)

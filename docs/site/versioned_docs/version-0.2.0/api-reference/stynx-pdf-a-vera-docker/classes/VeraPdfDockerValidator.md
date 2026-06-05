[**@stynx/pdf-a-vera-docker**](../index.md)

---

[@stynx/pdf-a-vera-docker](../index.md) / VeraPdfDockerValidator

# Class: VeraPdfDockerValidator

Defined in: [packages/pdf-a-vera-docker/src/validator.ts:26](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf-a-vera-docker/src/validator.ts#L26)

## Implements

- `PdfAValidator`

## Constructors

### Constructor

> **new VeraPdfDockerValidator**(`options?`): `VeraPdfDockerValidator`

Defined in: [packages/pdf-a-vera-docker/src/validator.ts:33](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf-a-vera-docker/src/validator.ts#L33)

#### Parameters

##### options?

[`VeraPdfDockerValidatorOptions`](../interfaces/VeraPdfDockerValidatorOptions.md) = `{}`

#### Returns

`VeraPdfDockerValidator`

## Methods

### validate()

> **validate**(`pdf`, `opts?`): `Promise`\<`PdfAValidationResult`\>

Defined in: [packages/pdf-a-vera-docker/src/validator.ts:42](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf-a-vera-docker/src/validator.ts#L42)

#### Parameters

##### pdf

`Uint8Array`

##### opts?

`PdfAValidateOptions` = `{}`

#### Returns

`Promise`\<`PdfAValidationResult`\>

#### Implementation of

`PdfAValidator.validate`

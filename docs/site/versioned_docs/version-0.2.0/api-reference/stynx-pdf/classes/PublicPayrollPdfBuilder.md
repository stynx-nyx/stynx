[**@stynx-nyx/pdf**](../index.md)

---

[@stynx-nyx/pdf](../index.md) / PublicPayrollPdfBuilder

# Class: PublicPayrollPdfBuilder

Defined in: [packages/pdf/src/templates/public-payroll/public-payroll-builder.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/templates/public-payroll/public-payroll-builder.ts#L12)

## Constructors

### Constructor

> **new PublicPayrollPdfBuilder**(`options?`): `PublicPayrollPdfBuilder`

Defined in: [packages/pdf/src/templates/public-payroll/public-payroll-builder.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/templates/public-payroll/public-payroll-builder.ts#L13)

#### Parameters

##### options?

[`PublicPayrollPdfBuilderOptions`](../interfaces/PublicPayrollPdfBuilderOptions.md) = `{}`

#### Returns

`PublicPayrollPdfBuilder`

## Methods

### buildPayslip()

> **buildPayslip**(`document`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [packages/pdf/src/templates/public-payroll/public-payroll-builder.ts:15](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/templates/public-payroll/public-payroll-builder.ts#L15)

#### Parameters

##### document

[`PublicPayslipDocument`](../interfaces/PublicPayslipDocument.md)

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

---

### buildYearlyIncome()

> **buildYearlyIncome**(`document`): `Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

Defined in: [packages/pdf/src/templates/public-payroll/public-payroll-builder.ts:20](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/templates/public-payroll/public-payroll-builder.ts#L20)

#### Parameters

##### document

[`PublicYearlyIncomeDocument`](../interfaces/PublicYearlyIncomeDocument.md)

#### Returns

`Promise`\<`Uint8Array`\<`ArrayBufferLike`\>\>

---

### validatePdfAStyle()

> **validatePdfAStyle**(`buffer`): [`PdfAStyleValidationResult`](../interfaces/PdfAStyleValidationResult.md)

Defined in: [packages/pdf/src/templates/public-payroll/public-payroll-builder.ts:25](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf/src/templates/public-payroll/public-payroll-builder.ts#L25)

#### Parameters

##### buffer

`Uint8Array`

#### Returns

[`PdfAStyleValidationResult`](../interfaces/PdfAStyleValidationResult.md)

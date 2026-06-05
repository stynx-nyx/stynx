[**@stynx/pdf-a**](../index.md)

---

[@stynx/pdf-a](../index.md) / PdfAValidationTelemetry

# Interface: PdfAValidationTelemetry

Defined in: [telemetry.ts:3](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf-a/src/telemetry.ts#L3)

## Methods

### increment()?

> `optional` **increment**(`metric`, `labels?`): `void` \| `Promise`\<`void`\>

Defined in: [telemetry.ts:4](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf-a/src/telemetry.ts#L4)

#### Parameters

##### metric

`string`

##### labels?

`Record`\<`string`, `string`\>

#### Returns

`void` \| `Promise`\<`void`\>

---

### observe()?

> `optional` **observe**(`metric`, `value`, `labels?`): `void` \| `Promise`\<`void`\>

Defined in: [telemetry.ts:5](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/pdf-a/src/telemetry.ts#L5)

#### Parameters

##### metric

`string`

##### value

`number`

##### labels?

`Record`\<`string`, `string`\>

#### Returns

`void` \| `Promise`\<`void`\>

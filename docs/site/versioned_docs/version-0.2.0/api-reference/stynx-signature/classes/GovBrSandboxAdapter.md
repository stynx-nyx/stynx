[**@stynx-nyx/signature**](../index.md)

---

[@stynx-nyx/signature](../index.md) / GovBrSandboxAdapter

# Class: GovBrSandboxAdapter

Defined in: [packages/signature/src/govbr-sandbox.ts:49](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/govbr-sandbox.ts#L49)

## Constructors

### Constructor

> **new GovBrSandboxAdapter**(`now?`): `GovBrSandboxAdapter`

Defined in: [packages/signature/src/govbr-sandbox.ts:52](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/govbr-sandbox.ts#L52)

#### Parameters

##### now?

() => `Date`

#### Returns

`GovBrSandboxAdapter`

## Methods

### complete()

> **complete**(`state`, `decision`, `challenge?`): [`GovBrSandboxResult`](../interfaces/GovBrSandboxResult.md)

Defined in: [packages/signature/src/govbr-sandbox.ts:93](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/govbr-sandbox.ts#L93)

#### Parameters

##### state

`string`

##### decision

[`GovBrSandboxDecision`](../type-aliases/GovBrSandboxDecision.md)

##### challenge?

`string`

#### Returns

[`GovBrSandboxResult`](../interfaces/GovBrSandboxResult.md)

---

### createRequest()

> **createRequest**(`input`): [`GovBrSandboxResult`](../interfaces/GovBrSandboxResult.md)

Defined in: [packages/signature/src/govbr-sandbox.ts:54](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/govbr-sandbox.ts#L54)

#### Parameters

##### input

[`GovBrSandboxRequest`](../interfaces/GovBrSandboxRequest.md)

#### Returns

[`GovBrSandboxResult`](../interfaces/GovBrSandboxResult.md)

---

### verify()

> **verify**(`payload`, `result`): `boolean`

Defined in: [packages/signature/src/govbr-sandbox.ts:131](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/signature/src/govbr-sandbox.ts#L131)

#### Parameters

##### payload

`Record`\<`string`, `unknown`\>

##### result

[`GovBrSandboxResult`](../interfaces/GovBrSandboxResult.md)

#### Returns

`boolean`

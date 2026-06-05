[**@stynx/auth**](../index.md)

---

[@stynx/auth](../index.md) / CognitoTokenVerifier

# Class: CognitoTokenVerifier

Defined in: [cognito-token-verifier.ts:33](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-token-verifier.ts#L33)

## Implements

- `TokenVerifier`

## Constructors

### Constructor

> **new CognitoTokenVerifier**(`options`): `CognitoTokenVerifier`

Defined in: [cognito-token-verifier.ts:40](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-token-verifier.ts#L40)

#### Parameters

##### options

[`CognitoTokenVerifierOptions`](../interfaces/CognitoTokenVerifierOptions.md)

#### Returns

`CognitoTokenVerifier`

## Methods

### verifyAuthorizationHeader()

> **verifyAuthorizationHeader**(`value`): `Promise`\<`AuthVerificationResult`\>

Defined in: [cognito-token-verifier.ts:47](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/auth/src/cognito-token-verifier.ts#L47)

#### Parameters

##### value

`string` \| `string`[] \| `undefined`

#### Returns

`Promise`\<`AuthVerificationResult`\>

#### Implementation of

`TokenVerifier.verifyAuthorizationHeader`

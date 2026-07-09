[**@stynx-nyx/health**](../index.md)

---

[@stynx-nyx/health](../index.md) / StynxHealthModuleOptions

# Interface: StynxHealthModuleOptions

Defined in: [tokens.ts:11](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/tokens.ts#L11)

## Properties

### appInfo?

> `optional` **appInfo?**: `Record`\<`string`, `unknown`\>

Defined in: [tokens.ts:14](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/tokens.ts#L14)

---

### infoFlagEnvVar?

> `optional` **infoFlagEnvVar?**: `string`

Defined in: [tokens.ts:13](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/tokens.ts#L13)

---

### jwksCheck?

> `optional` **jwksCheck?**: () => `Promise`\<`void`\>

Defined in: [tokens.ts:17](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/tokens.ts#L17)

#### Returns

`Promise`\<`void`\>

---

### metricsIpAllowlist?

> `optional` **metricsIpAllowlist?**: `string`[]

Defined in: [tokens.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/tokens.ts#L12)

---

### pgCheck?

> `optional` **pgCheck?**: () => `Promise`\<`void`\>

Defined in: [tokens.ts:15](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/tokens.ts#L15)

#### Returns

`Promise`\<`void`\>

---

### redisCheck?

> `optional` **redisCheck?**: () => `Promise`\<`void`\>

Defined in: [tokens.ts:16](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/tokens.ts#L16)

#### Returns

`Promise`\<`void`\>

---

### s3Check?

> `optional` **s3Check?**: () => `Promise`\<`void`\>

Defined in: [tokens.ts:18](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/health/src/tokens.ts#L18)

#### Returns

`Promise`\<`void`\>

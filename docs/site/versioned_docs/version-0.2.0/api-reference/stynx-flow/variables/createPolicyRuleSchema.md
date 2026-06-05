[**@stynx/flow**](../index.md)

---

[@stynx/flow](../index.md) / createPolicyRuleSchema

# Variable: createPolicyRuleSchema

> `const` **createPolicyRuleSchema**: `ZodObject`\<\{ `action`: `ZodOptional`\<`ZodString`\>; `capability`: `ZodOptional`\<`ZodString`\>; `conditions`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `effect`: `ZodEnum`\<\{ `allow`: `"allow"`; `deny`: `"deny"`; \}\>; `meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `nodeCode`: `ZodOptional`\<`ZodString`\>; `policySetId`: `ZodString`; `priority`: `ZodOptional`\<`ZodNumber`\>; `reasonCode`: `ZodOptional`\<`ZodString`\>; `statusCode`: `ZodOptional`\<`ZodString`\>; \}, `$strip`\>

Defined in: [validation.ts:115](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/validation.ts#L115)

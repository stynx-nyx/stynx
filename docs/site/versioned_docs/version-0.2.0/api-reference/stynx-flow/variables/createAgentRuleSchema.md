[**@stynx-nyx/flow**](../index.md)

---

[@stynx-nyx/flow](../index.md) / createAgentRuleSchema

# Variable: createAgentRuleSchema

> `const` **createAgentRuleSchema**: `ZodObject`\<\{ `nodeId`: `ZodString`; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `permissionKey`: `ZodOptional`\<`ZodString`\>; `resolverKey`: `ZodOptional`\<`ZodString`\>; `ruleType`: `ZodEnum`\<\{ `permission`: `"permission"`; `resolver_fn`: `"resolver_fn"`; `user`: `"user"`; \}\>; `sortOrder`: `ZodOptional`\<`ZodNumber`\>; `userId`: `ZodOptional`\<`ZodString`\>; \}, `$strip`\>

Defined in: [validation.ts:68](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/validation.ts#L68)

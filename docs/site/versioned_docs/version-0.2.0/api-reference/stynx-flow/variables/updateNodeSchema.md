[**@stynx/flow**](../index.md)

---

[@stynx/flow](../index.md) / updateNodeSchema

# Variable: updateNodeSchema

> `const` **updateNodeSchema**: `ZodObject`\<\{ `allowedActions`: `ZodOptional`\<`ZodOptional`\<`ZodArray`\<`ZodString`\>\>\>; `code`: `ZodOptional`\<`ZodString`\>; `decisionPolicy`: `ZodOptional`\<`ZodOptional`\<`ZodEnum`\<\{ `all`: `"all"`; `any`: `"any"`; `quorum`: `"quorum"`; \}\>\>\>; `entryRule`: `ZodOptional`\<`ZodOptional`\<`ZodString`\>\>; `exitRule`: `ZodOptional`\<`ZodOptional`\<`ZodString`\>\>; `kind`: `ZodOptional`\<`ZodEnum`\<\{ `auto`: `"auto"`; `end`: `"end"`; `gateway`: `"gateway"`; `human`: `"human"`; `start`: `"start"`; `system`: `"system"`; \}\>\>; `meta`: `ZodOptional`\<`ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>\>; `name`: `ZodOptional`\<`ZodOptional`\<`ZodString`\>\>; `quorumRatio`: `ZodOptional`\<`ZodOptional`\<`ZodString`\>\>; `slaSeconds`: `ZodOptional`\<`ZodOptional`\<`ZodNumber`\>\>; `sortOrder`: `ZodOptional`\<`ZodOptional`\<`ZodNumber`\>\>; \}, `$strip`\>

Defined in: [validation.ts:53](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/validation.ts#L53)

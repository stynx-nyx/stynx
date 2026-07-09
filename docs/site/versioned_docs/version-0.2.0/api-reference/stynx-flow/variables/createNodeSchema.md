[**@stynx-nyx/flow**](../index.md)

---

[@stynx-nyx/flow](../index.md) / createNodeSchema

# Variable: createNodeSchema

> `const` **createNodeSchema**: `ZodObject`\<\{ `allowedActions`: `ZodOptional`\<`ZodArray`\<`ZodString`\>\>; `code`: `ZodString`; `decisionPolicy`: `ZodOptional`\<`ZodEnum`\<\{ `all`: `"all"`; `any`: `"any"`; `quorum`: `"quorum"`; \}\>\>; `entryRule`: `ZodOptional`\<`ZodString`\>; `exitRule`: `ZodOptional`\<`ZodString`\>; `graphId`: `ZodString`; `kind`: `ZodEnum`\<\{ `auto`: `"auto"`; `end`: `"end"`; `gateway`: `"gateway"`; `human`: `"human"`; `start`: `"start"`; `system`: `"system"`; \}\>; `meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `name`: `ZodOptional`\<`ZodString`\>; `quorumRatio`: `ZodOptional`\<`ZodString`\>; `slaSeconds`: `ZodOptional`\<`ZodNumber`\>; `sortOrder`: `ZodOptional`\<`ZodNumber`\>; \}, `$strip`\>

Defined in: [validation.ts:38](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/validation.ts#L38)

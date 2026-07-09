[**@stynx-nyx/flow**](../index.md)

---

[@stynx-nyx/flow](../index.md) / createNodeFormRuleSchema

# Variable: createNodeFormRuleSchema

> `const` **createNodeFormRuleSchema**: `ZodObject`\<\{ `applicability`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `formId`: `ZodString`; `gatingMode`: `ZodOptional`\<`ZodEnum`\<\{ `all_required`: `"all_required"`; `any`: `"any"`; `any_answered`: `"any_answered"`; `score_threshold`: `"score_threshold"`; `threshold`: `"threshold"`; \}\>\>; `meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `nodeId`: `ZodString`; `required`: `ZodOptional`\<`ZodBoolean`\>; `threshold`: `ZodOptional`\<`ZodString`\>; `weight`: `ZodOptional`\<`ZodString`\>; \}, `$strip`\>

Defined in: [validation.ts:91](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/validation.ts#L91)

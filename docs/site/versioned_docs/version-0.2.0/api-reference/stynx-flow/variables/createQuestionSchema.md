[**@stynx/flow**](../index.md)

---

[@stynx/flow](../index.md) / createQuestionSchema

# Variable: createQuestionSchema

> `const` **createQuestionSchema**: `ZodObject`\<\{ `blocksSubmit`: `ZodOptional`\<`ZodBoolean`\>; `fieldType`: `ZodEnum`\<\{ `boolean`: `"boolean"`; `cnpj`: `"cnpj"`; `date`: `"date"`; `email`: `"email"`; `file`: `"file"`; `multiselect`: `"multiselect"`; `number`: `"number"`; `select`: `"select"`; `string`: `"string"`; `text`: `"text"`; `url`: `"url"`; \}\>; `formId`: `ZodString`; `key`: `ZodString`; `label`: `ZodString`; `meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `options`: `ZodOptional`\<`ZodArray`\<`ZodUnknown`\>\>; `required`: `ZodOptional`\<`ZodBoolean`\>; `sortOrder`: `ZodOptional`\<`ZodNumber`\>; `validators`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `visibleIf`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `$strip`\>

Defined in: [validation.ts:211](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/flow/src/validation.ts#L211)

[**@stynx-nyx/data**](../index.md)

---

[@stynx-nyx/data](../index.md) / SoftDeleteAwareSelect

# Type Alias: SoftDeleteAwareSelect\<TTable\>

> **SoftDeleteAwareSelect**\<`TTable`\> = [`LiveSelectBuilder`](LiveSelectBuilder.md) & `object`

Defined in: [packages/data/src/query-helpers.ts:64](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/query-helpers.ts#L64)

## Type Declaration

### onlyDeleted()

> **onlyDeleted**(): [`ArchiveSelectQuery`](../classes/ArchiveSelectQuery.md)\<`TTable`, `"onlyDeleted"`\>

#### Returns

[`ArchiveSelectQuery`](../classes/ArchiveSelectQuery.md)\<`TTable`, `"onlyDeleted"`\>

### withDeleted()

> **withDeleted**(): [`ArchiveSelectQuery`](../classes/ArchiveSelectQuery.md)\<`TTable`, `"withDeleted"`\>

#### Returns

[`ArchiveSelectQuery`](../classes/ArchiveSelectQuery.md)\<`TTable`, `"withDeleted"`\>

## Type Parameters

### TTable

`TTable` _extends_ `AnyPgTable`

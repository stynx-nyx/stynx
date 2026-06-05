[**@stynx/data**](../index.md)

---

[@stynx/data](../index.md) / ArchiveQueryRow

# Type Alias: ArchiveQueryRow\<TTable, TMode\>

> **ArchiveQueryRow**\<`TTable`, `TMode`\> = `TMode` _extends_ `"withDeleted"` ? [`WithDeletedRow`](WithDeletedRow.md)\<`TTable`\> : [`OnlyDeletedRow`](OnlyDeletedRow.md)\<`TTable`\>

Defined in: [packages/data/src/query-helpers.ts:60](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/data/src/query-helpers.ts#L60)

## Type Parameters

### TTable

`TTable` _extends_ `AnyPgTable`

### TMode

`TMode` _extends_ [`ArchiveMode`](ArchiveMode.md)

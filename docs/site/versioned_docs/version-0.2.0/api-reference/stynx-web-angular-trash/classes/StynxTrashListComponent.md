[**@stynx-web/angular-trash**](../index.md)

---

[@stynx-web/angular-trash](../index.md) / StynxTrashListComponent

# Class: StynxTrashListComponent

Defined in: [trash-list.component.ts:246](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L246)

## Constructors

### Constructor

> **new StynxTrashListComponent**(): `StynxTrashListComponent`

#### Returns

`StynxTrashListComponent`

## Properties

### activeFilters

> `readonly` **activeFilters**: `WritableSignal`\<`Set`\<[`StynxTrashFilter`](../type-aliases/StynxTrashFilter.md)\>\>

Defined in: [trash-list.component.ts:271](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L271)

---

### adapter

> **adapter**: [`StynxTrashAdapter`](../interfaces/StynxTrashAdapter.md) \| `null` = `null`

Defined in: [trash-list.component.ts:252](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L252)

---

### columns

> **columns**: [`StynxTrashColumn`](../interfaces/StynxTrashColumn.md)[]

Defined in: [trash-list.component.ts:254](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L254)

---

### confirmingId

> `readonly` **confirmingId**: `WritableSignal`\<`string` \| `null`\>

Defined in: [trash-list.component.ts:268](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L268)

---

### errorMessage

> `readonly` **errorMessage**: `WritableSignal`\<`string`\>

Defined in: [trash-list.component.ts:267](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L267)

---

### filterByActor

> **filterByActor**: `string` \| `null` = `null`

Defined in: [trash-list.component.ts:259](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L259)

---

### hardDeletePermission

> **hardDeletePermission**: `string` = `'archive:hard-delete:*'`

Defined in: [trash-list.component.ts:258](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L258)

---

### items

> `readonly` **items**: `WritableSignal`\<[`StynxTrashItem`](../interfaces/StynxTrashItem.md)[]\>

Defined in: [trash-list.component.ts:262](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L262)

---

### kinds

> **kinds**: [`StynxTrashKindConfig`](../interfaces/StynxTrashKindConfig.md)[] = `STYNX_DEFAULT_TRASH_KINDS`

Defined in: [trash-list.component.ts:253](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L253)

---

### locale

> **locale**: `string` = `'en-US'`

Defined in: [trash-list.component.ts:260](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L260)

---

### pageIndex

> `readonly` **pageIndex**: `WritableSignal`\<`number`\>

Defined in: [trash-list.component.ts:265](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L265)

---

### pageSize

> `readonly` **pageSize**: `WritableSignal`\<`number`\>

Defined in: [trash-list.component.ts:266](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L266)

---

### resource

> **resource**: [`StynxTrashKind`](../type-aliases/StynxTrashKind.md) = `'record'`

Defined in: [trash-list.component.ts:251](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L251)

---

### rows

> `readonly` **rows**: `WritableSignal`\<`Record`\<`string`, `unknown`\>[]\>

Defined in: [trash-list.component.ts:263](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L263)

---

### selectedCount

> `readonly` **selectedCount**: `Signal`\<`number`\>

Defined in: [trash-list.component.ts:272](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L272)

---

### selectedIds

> `readonly` **selectedIds**: `WritableSignal`\<`Set`\<`string`\>\>

Defined in: [trash-list.component.ts:270](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L270)

---

### selectedKind

> `readonly` **selectedKind**: `WritableSignal`\<`""` \| [`StynxTrashKind`](../type-aliases/StynxTrashKind.md)\>

Defined in: [trash-list.component.ts:269](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L269)

---

### total

> `readonly` **total**: `WritableSignal`\<`number`\>

Defined in: [trash-list.component.ts:264](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L264)

## Accessors

### resolvedColumns

#### Get Signature

> **get** **resolvedColumns**(): [`StynxTrashColumn`](../interfaces/StynxTrashColumn.md)[]

Defined in: [trash-list.component.ts:274](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L274)

##### Returns

[`StynxTrashColumn`](../interfaces/StynxTrashColumn.md)[]

## Methods

### activeKind()

> **activeKind**(): [`StynxTrashKind`](../type-aliases/StynxTrashKind.md)

Defined in: [trash-list.component.ts:278](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L278)

#### Returns

[`StynxTrashKind`](../type-aliases/StynxTrashKind.md)

---

### bulkHardDelete()

> **bulkHardDelete**(): `Promise`\<`void`\>

Defined in: [trash-list.component.ts:399](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L399)

#### Returns

`Promise`\<`void`\>

---

### bulkRestore()

> **bulkRestore**(): `Promise`\<`void`\>

Defined in: [trash-list.component.ts:383](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L383)

#### Returns

`Promise`\<`void`\>

---

### clearSelection()

> **clearSelection**(): `void`

Defined in: [trash-list.component.ts:379](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L379)

#### Returns

`void`

---

### confirmHardDelete()

> **confirmHardDelete**(): `Promise`\<`void`\>

Defined in: [trash-list.component.ts:325](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L325)

#### Returns

`Promise`\<`void`\>

---

### isFilterActive()

> **isFilterActive**(`filter`): `boolean`

Defined in: [trash-list.component.ts:359](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L359)

#### Parameters

##### filter

[`StynxTrashFilter`](../type-aliases/StynxTrashFilter.md)

#### Returns

`boolean`

---

### isSelected()

> **isSelected**(`id`): `boolean`

Defined in: [trash-list.component.ts:375](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L375)

#### Parameters

##### id

`string`

#### Returns

`boolean`

---

### load()

> **load**(): `Promise`\<`void`\>

Defined in: [trash-list.component.ts:282](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L282)

#### Returns

`Promise`\<`void`\>

---

### mayHardDelete()

> **mayHardDelete**(`item`): `boolean`

Defined in: [trash-list.component.ts:415](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L415)

#### Parameters

##### item

[`StynxTrashItem`](../interfaces/StynxTrashItem.md)

#### Returns

`boolean`

---

### openConfirm()

> **openConfirm**(`id`): `void`

Defined in: [trash-list.component.ts:321](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L321)

#### Parameters

##### id

`string`

#### Returns

`void`

---

### restore()

> **restore**(`id`): `Promise`\<`void`\>

Defined in: [trash-list.component.ts:304](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L304)

#### Parameters

##### id

`string`

#### Returns

`Promise`\<`void`\>

---

### retentionCountdown()

> **retentionCountdown**(`item`): `string`

Defined in: [trash-list.component.ts:419](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L419)

#### Parameters

##### item

[`StynxTrashItem`](../interfaces/StynxTrashItem.md)

#### Returns

`string`

---

### selectKind()

> **selectKind**(`kind`): `Promise`\<`void`\>

Defined in: [trash-list.component.ts:337](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L337)

#### Parameters

##### kind

[`StynxTrashKind`](../type-aliases/StynxTrashKind.md)

#### Returns

`Promise`\<`void`\>

---

### setPage()

> **setPage**(`pageIndex`, `pageSize`): `Promise`\<`void`\>

Defined in: [trash-list.component.ts:298](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L298)

#### Parameters

##### pageIndex

`number`

##### pageSize

`number`

#### Returns

`Promise`\<`void`\>

---

### toggleFilter()

> **toggleFilter**(`filter`): `Promise`\<`void`\>

Defined in: [trash-list.component.ts:344](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L344)

#### Parameters

##### filter

[`StynxTrashFilter`](../type-aliases/StynxTrashFilter.md)

#### Returns

`Promise`\<`void`\>

---

### toggleSelected()

> **toggleSelected**(`id`): `void`

Defined in: [trash-list.component.ts:363](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-trash/src/trash-list.component.ts#L363)

#### Parameters

##### id

`string`

#### Returns

`void`

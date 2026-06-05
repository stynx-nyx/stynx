[**@stynx-web/angular-ui**](../index.md)

---

[@stynx-web/angular-ui](../index.md) / StynxTableComponent

# Class: StynxTableComponent\<TRecord\>

Defined in: [angular-ui/src/table.component.ts:52](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-ui/src/table.component.ts#L52)

## Type Parameters

### TRecord

`TRecord` _extends_ `Record`\<`string`, `unknown`\>

## Constructors

### Constructor

> **new StynxTableComponent**\<`TRecord`\>(): `StynxTableComponent`\<`TRecord`\>

#### Returns

`StynxTableComponent`\<`TRecord`\>

## Properties

### columns

> **columns**: [`StynxTableColumn`](../interfaces/StynxTableColumn.md)\<`TRecord`\>[] = `[]`

Defined in: [angular-ui/src/table.component.ts:53](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-ui/src/table.component.ts#L53)

---

### rows

> **rows**: `TRecord`[] = `[]`

Defined in: [angular-ui/src/table.component.ts:54](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-ui/src/table.component.ts#L54)

---

### rowTrackBy

> **rowTrackBy**: ((`row`) => `string` \| `number`) \| `undefined`

Defined in: [angular-ui/src/table.component.ts:55](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-ui/src/table.component.ts#L55)

## Methods

### trackBy()

> `protected` **trackBy**(`row`): `string` \| `number`

Defined in: [angular-ui/src/table.component.ts:57](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-ui/src/table.component.ts#L57)

#### Parameters

##### row

`TRecord`

#### Returns

`string` \| `number`

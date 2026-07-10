[**@stynx-nyx/angular-flow**](../index.md)

---

[@stynx-nyx/angular-flow](../index.md) / StynxFlowGraphDesignerComponent

# Class: StynxFlowGraphDesignerComponent

Defined in: [flow-graph-designer.component.ts:160](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L160)

## Implements

- `OnChanges`

## Constructors

### Constructor

> **new StynxFlowGraphDesignerComponent**(): `StynxFlowGraphDesignerComponent`

#### Returns

`StynxFlowGraphDesignerComponent`

## Properties

### createGraph

> `readonly` **createGraph**: `EventEmitter`\<[`FlowScope`](../interfaces/FlowScope.md) \| `undefined`\>

Defined in: [flow-graph-designer.component.ts:166](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L166)

---

### createScope

> `readonly` **createScope**: `EventEmitter`\<`void`\>

Defined in: [flow-graph-designer.component.ts:165](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L165)

---

### edges

> **edges**: [`FlowEdge`](../interfaces/FlowEdge.md)[] = `[]`

Defined in: [flow-graph-designer.component.ts:173](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L173)

---

### edgeSelected

> `readonly` **edgeSelected**: `EventEmitter`\<[`FlowEdge`](../interfaces/FlowEdge.md)\>

Defined in: [flow-graph-designer.component.ts:168](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L168)

---

### errorMessage

> **errorMessage**: `string` = `''`

Defined in: [flow-graph-designer.component.ts:176](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L176)

---

### graphId

> **graphId**: `string` = `''`

Defined in: [flow-graph-designer.component.ts:164](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L164)

---

### graphs

> **graphs**: [`FlowGraph`](../interfaces/FlowGraph.md)[] = `[]`

Defined in: [flow-graph-designer.component.ts:171](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L171)

---

### loading

> **loading**: `boolean` = `false`

Defined in: [flow-graph-designer.component.ts:174](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L174)

---

### nodes

> **nodes**: [`FlowNode`](../interfaces/FlowNode.md)[] = `[]`

Defined in: [flow-graph-designer.component.ts:172](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L172)

---

### nodeSelected

> `readonly` **nodeSelected**: `EventEmitter`\<[`FlowNode`](../interfaces/FlowNode.md)\>

Defined in: [flow-graph-designer.component.ts:167](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L167)

---

### publishingGraphId

> **publishingGraphId**: `string` = `''`

Defined in: [flow-graph-designer.component.ts:175](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L175)

---

### scopeId

> **scopeId**: `string` = `''`

Defined in: [flow-graph-designer.component.ts:163](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L163)

---

### scopes

> **scopes**: [`FlowScope`](../interfaces/FlowScope.md)[] = `[]`

Defined in: [flow-graph-designer.component.ts:170](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L170)

## Accessors

### activeGraph

#### Get Signature

> **get** **activeGraph**(): [`FlowGraph`](../interfaces/FlowGraph.md) \| `undefined`

Defined in: [flow-graph-designer.component.ts:182](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L182)

##### Returns

[`FlowGraph`](../interfaces/FlowGraph.md) \| `undefined`

---

### activeScope

#### Get Signature

> **get** **activeScope**(): [`FlowScope`](../interfaces/FlowScope.md) \| `undefined`

Defined in: [flow-graph-designer.component.ts:178](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L178)

##### Returns

[`FlowScope`](../interfaces/FlowScope.md) \| `undefined`

---

### hasNoGraphsForActiveScope

#### Get Signature

> **get** **hasNoGraphsForActiveScope**(): `boolean`

Defined in: [flow-graph-designer.component.ts:190](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L190)

##### Returns

`boolean`

---

### hasNoScopes

#### Get Signature

> **get** **hasNoScopes**(): `boolean`

Defined in: [flow-graph-designer.component.ts:186](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L186)

##### Returns

`boolean`

## Methods

### graphStatusLabel()

> **graphStatusLabel**(`graph`): `string`

Defined in: [flow-graph-designer.component.ts:222](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L222)

#### Parameters

##### graph

[`FlowGraph`](../interfaces/FlowGraph.md)

#### Returns

`string`

---

### load()

> **load**(): `Promise`\<`void`\>

Defined in: [flow-graph-designer.component.ts:198](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L198)

#### Returns

`Promise`\<`void`\>

---

### ngOnChanges()

> **ngOnChanges**(): `Promise`\<`void`\>

Defined in: [flow-graph-designer.component.ts:194](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L194)

A callback method that is invoked immediately after the
default change detector has checked data-bound properties
if at least one has changed, and before the view and content
children are checked.

#### Returns

`Promise`\<`void`\>

#### Implementation of

`OnChanges.ngOnChanges`

---

### publishActiveGraph()

> **publishActiveGraph**(): `Promise`\<`void`\>

Defined in: [flow-graph-designer.component.ts:228](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/angular-flow/src/flow-graph-designer.component.ts#L228)

#### Returns

`Promise`\<`void`\>

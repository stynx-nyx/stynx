[**@stynx-web/sdk**](../index.md)

---

[@stynx-web/sdk](../index.md) / $FlowGraphImportDocument

# Variable: $FlowGraphImportDocument

> `const` **$FlowGraphImportDocument**: `object`

Defined in: [packages-web/sdk/src/generated/schemas/$FlowGraphImportDocument.ts:5](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages-web/sdk/src/generated/schemas/$FlowGraphImportDocument.ts#L5)

## Type Declaration

### properties

> `readonly` **properties**: `object`

#### properties.agentRules

> `readonly` **agentRules**: `object`

#### properties.agentRules.contains

> `readonly` **contains**: `object`

#### properties.agentRules.contains.contains

> `readonly` **contains**: readonly \[\{ `type`: `"FlowJsonObject"`; \}, \{ `properties`: \{ `nodeCode`: \{ `isRequired`: `true`; `type`: `"string"`; \}; \}; \}\]

#### properties.agentRules.contains.type

> `readonly` **type**: `"all-of"` = `'all-of'`

#### properties.agentRules.type

> `readonly` **type**: `"array"` = `'array'`

#### properties.edges

> `readonly` **edges**: `object`

#### properties.edges.contains

> `readonly` **contains**: `object`

#### properties.edges.contains.type

> `readonly` **type**: `"FlowGraphImportEdge"` = `'FlowGraphImportEdge'`

#### properties.edges.type

> `readonly` **type**: `"array"` = `'array'`

#### properties.graph

> `readonly` **graph**: `object`

#### properties.graph.isRequired

> `readonly` **isRequired**: `true` = `true`

#### properties.graph.type

> `readonly` **type**: `"FlowJsonObject"` = `'FlowJsonObject'`

#### properties.nodeFormRules

> `readonly` **nodeFormRules**: `object`

#### properties.nodeFormRules.contains

> `readonly` **contains**: `object`

#### properties.nodeFormRules.contains.contains

> `readonly` **contains**: readonly \[\{ `type`: `"FlowJsonObject"`; \}, \{ `properties`: \{ `nodeCode`: \{ `isRequired`: `true`; `type`: `"string"`; \}; \}; \}\]

#### properties.nodeFormRules.contains.type

> `readonly` **type**: `"all-of"` = `'all-of'`

#### properties.nodeFormRules.type

> `readonly` **type**: `"array"` = `'array'`

#### properties.nodes

> `readonly` **nodes**: `object`

#### properties.nodes.contains

> `readonly` **contains**: `object`

#### properties.nodes.contains.type

> `readonly` **type**: `"FlowGraphImportNode"` = `'FlowGraphImportNode'`

#### properties.nodes.isRequired

> `readonly` **isRequired**: `true` = `true`

#### properties.nodes.type

> `readonly` **type**: `"array"` = `'array'`

#### properties.transitionEffects

> `readonly` **transitionEffects**: `object`

#### properties.transitionEffects.contains

> `readonly` **contains**: `object`

#### properties.transitionEffects.contains.type

> `readonly` **type**: `"FlowJsonObject"` = `'FlowJsonObject'`

#### properties.transitionEffects.type

> `readonly` **type**: `"array"` = `'array'`

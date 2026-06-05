[**@stynx/sessions**](../index.md)

---

[@stynx/sessions](../index.md) / SessionMirrorWriter

# Class: SessionMirrorWriter

Defined in: [packages/sessions/src/session-mirror.writer.ts:9](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/session-mirror.writer.ts#L9)

## Implements

- [`SessionMirror`](../interfaces/SessionMirror.md)

## Constructors

### Constructor

> **new SessionMirrorWriter**(`moduleRef`): `SessionMirrorWriter`

Defined in: [packages/sessions/src/session-mirror.writer.ts:10](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/session-mirror.writer.ts#L10)

#### Parameters

##### moduleRef

`ModuleRef`

#### Returns

`SessionMirrorWriter`

## Methods

### append()

> **append**(`entry`): `Promise`\<`void`\>

Defined in: [packages/sessions/src/session-mirror.writer.ts:12](https://github.com/aarusso-nyx/stynx/blob/f54a7f51a22215c0ee06c6f06d8420d5b798763d/packages/sessions/src/session-mirror.writer.ts#L12)

#### Parameters

##### entry

[`SessionMirrorEntry`](../interfaces/SessionMirrorEntry.md)

#### Returns

`Promise`\<`void`\>

#### Implementation of

[`SessionMirror`](../interfaces/SessionMirror.md).[`append`](../interfaces/SessionMirror.md#append)

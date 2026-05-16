// C-4 Session S3-2 — Bookmark entity types
//
// Hand-authored to replace the TypeORM-shaped entity the scaffolder
// referenced but never emitted. Stynx uses @stynx/data (drizzle-orm
// based), not TypeORM, so this file is a plain TS shape, not a
// TypeORM entity class. Filed against D-A-15 (scaffolder API templates
// are codex-canonical / TypeORM-shaped, not stynx-shaped).
//
// A follow-up S3-2-step-2 session would translate this into a real
// drizzle table definition under `domain/demo-bookmark/api/src/demo-
// bookmark/schema.ts` and wire it via `@stynx/data`'s Database token.

export interface Bookmark {
  id: string;
  tenant_id: string;
  owner_id: string;
  url: string;
  title: string | null;
  notes: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}

export interface BookmarkTag {
  bookmark_id: string;
  tag: string;
  created_at: Date;
}

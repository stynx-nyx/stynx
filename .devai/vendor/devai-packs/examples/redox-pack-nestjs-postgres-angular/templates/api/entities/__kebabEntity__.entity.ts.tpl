/* Generated for __NAMESPACE__/__MODULE__ — spec: __SPEC_VERSION__ sha: __SPEC_SHA__ */

/*
 * Template-shaped entity: plain TS class with the blueprint's
 * fields rendered into the class body. No ORM annotations — the
 * scaffolded service uses an in-memory Map for the template
 * shape, and adopters replace the entity declaration with their
 * preferred ORM's mapping (TypeORM `@Entity` + `@Column`,
 * Drizzle table builder, Prisma model, etc.) when they wire the
 * data layer.
 *
 * Phase 22.E (D-A-15) — replaced the pre-22.E TypeORM-decorated
 * hardcoded `message` / `recipient` fields with a blueprint-
 * driven rendering. The __ENTITY_TS_FIELDS__ token is built by
 * the scaffolder from the blueprint entity's `fields[]`.
 */
export class __classEntity__ {
  id!: string;
__ENTITY_TS_FIELDS__
  created_at?: string;
  updated_at?: string;
}

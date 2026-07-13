# `@stynx-nyx/preferences`

Closed, tenant-and-subject scoped preferences and a narrow profile projection. Mount `StynxPreferencesModule.forRoot()` after STYNX core/data/auth context modules. HTTP writes require a strong `If-Match` ETag and never accept tenant or subject identifiers from callers.

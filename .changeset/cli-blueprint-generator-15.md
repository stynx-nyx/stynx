---
'@stynx-nyx/cli': minor
---

Add `stynx generate module --blueprint <file> --out <directory>` for validated,
deterministic module generation. The generated Nest routes require exact
permissions, use the caller's trusted tenant context and parameterized database
operations, and include FORCE RLS SQL. Generation refuses unsafe blueprints,
existing output, and partial writes; `--check` compares an existing generated
directory without changing it. The fixed STYNX package group advances together.

Consumers must review and apply the emitted SQL migration, install the generated
module behind the STYNX authentication guard and data module, and grant the
generated permission keys according to their own policy.

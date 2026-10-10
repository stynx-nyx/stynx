# Schemas

This directory is the canonical, Architect-owned STYNX schema corpus. The
HTTP error-envelope schema is consumed by runtime and documentation tooling;
generated documentation is a published view, never a second authority.

`outbox-retirement.schema.json` defines the minor-release retirement input and
JSON receipt. Service `Date` values serialize as ISO instants; runtime/SQL also
enforce the documented UTF-8 byte bounds. Retirement never proves delivery.

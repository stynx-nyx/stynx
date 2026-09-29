-- Tenant-scoped request delivery persists transport evidence under stynx_app.
-- Existing FORCE RLS and tenant policies from 0021 continue to govern rows.
GRANT UPDATE ON outbox.event_attempts TO stynx_app;

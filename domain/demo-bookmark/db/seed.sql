-- Generated from BP-DEMO-BOOKMARK-001 v0.1.0 sha256:a5553692
-- Hand-finished in C-4 Session S3 (closes F-9 step 1/N).
-- Minimal seed for demo purposes only — uses dev tenant + owner IDs
-- that match the reference-api dev-auth flow (see reference/api/migrations/0001_reference.sql).

-- A handful of representative bookmarks under the demo tenant.
INSERT INTO demo.demo__bookmark_bookmark
  (id, tenant_id, owner_id, url, title, notes)
VALUES
  ('00000000-0000-4000-8000-000000bk0001'::uuid,
   '00000000-0000-4000-8000-000000ten001'::uuid,
   '00000000-0000-4000-8000-00000000user'::uuid,
   'https://devai.example/architecture',
   'DEVAI architecture',
   'Useful reference for the C-4 pilot.'),
  ('00000000-0000-4000-8000-000000bk0002'::uuid,
   '00000000-0000-4000-8000-000000ten001'::uuid,
   '00000000-0000-4000-8000-00000000user'::uuid,
   'https://devai.example/adopters',
   'Adopter docs',
   NULL),
  ('00000000-0000-4000-8000-000000bk0003'::uuid,
   '00000000-0000-4000-8000-000000ten001'::uuid,
   '00000000-0000-4000-8000-00000000user'::uuid,
   'https://stynx.example/specs',
   'Stynx specs index',
   'Reading-order anchor for stynx.')
ON CONFLICT (id) DO NOTHING;

INSERT INTO demo.demo__bookmark_bookmark_tag
  (bookmark_id, tag)
VALUES
  ('00000000-0000-4000-8000-000000bk0001'::uuid, 'devai'),
  ('00000000-0000-4000-8000-000000bk0001'::uuid, 'architecture'),
  ('00000000-0000-4000-8000-000000bk0002'::uuid, 'devai'),
  ('00000000-0000-4000-8000-000000bk0002'::uuid, 'adopters'),
  ('00000000-0000-4000-8000-000000bk0003'::uuid, 'stynx')
ON CONFLICT (bookmark_id, tag) DO NOTHING;

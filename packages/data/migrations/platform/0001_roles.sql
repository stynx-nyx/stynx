DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stynx_owner') THEN
    CREATE ROLE stynx_owner LOGIN NOINHERIT BYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stynx_app') THEN
    CREATE ROLE stynx_app LOGIN NOINHERIT NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'stynx_reader') THEN
    CREATE ROLE stynx_reader LOGIN NOINHERIT NOBYPASSRLS;
  END IF;
END
$$;

DO $$
BEGIN
  EXECUTE format(
    'GRANT CONNECT, CREATE ON DATABASE %I TO stynx_owner',
    current_database()
  );
  EXECUTE format(
    'GRANT CONNECT ON DATABASE %I TO stynx_app, stynx_reader',
    current_database()
  );
END
$$;

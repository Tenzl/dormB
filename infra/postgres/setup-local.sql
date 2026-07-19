-- Native PostgreSQL bootstrap for Courtyard local development.
-- Run as a superuser (typically postgres), for example:
--   psql -U postgres -h 127.0.0.1 -p 5432 -f infra/postgres/setup-local.sql
-- Or: .\scripts\Setup-Postgres.ps1

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'dormitory') THEN
    CREATE ROLE dormitory LOGIN PASSWORD 'dormitory';
  ELSE
    ALTER ROLE dormitory WITH LOGIN PASSWORD 'dormitory';
  END IF;
END
$$;

SELECT 'CREATE DATABASE dormitory OWNER dormitory'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'dormitory')\gexec

SELECT 'CREATE DATABASE dormitory_test OWNER dormitory'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'dormitory_test')\gexec

GRANT ALL PRIVILEGES ON DATABASE dormitory TO dormitory;
GRANT ALL PRIVILEGES ON DATABASE dormitory_test TO dormitory;

\connect dormitory
GRANT ALL ON SCHEMA public TO dormitory;
ALTER SCHEMA public OWNER TO dormitory;

\connect dormitory_test
GRANT ALL ON SCHEMA public TO dormitory;
ALTER SCHEMA public OWNER TO dormitory;

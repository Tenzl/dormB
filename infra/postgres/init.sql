-- Legacy Compose init hook. Prefer infra/postgres/setup-local.sql for native installs.
-- Kept so older docs that mention init.sql still resolve to a working test-db bootstrap.
SELECT 'CREATE DATABASE dormitory_test OWNER dormitory'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'dormitory_test')\gexec

SELECT 'CREATE DATABASE dormitory_test OWNER dormitory'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'dormitory_test')\gexec

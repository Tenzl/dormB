import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema.js'

export function createDb(databaseUrl: string) {
  const pool = new Pool({ connectionString: databaseUrl, max: 10, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 })
  return { db: drizzle(pool, { schema }), pool }
}

export type AppDb = ReturnType<typeof createDb>['db']

export async function migrateDb(pool: Pool) {
  await pool.query('CREATE TABLE IF NOT EXISTS app_schema_migrations (version text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')
  for (const version of ['0000_postgres', '0001_wise_harrier']) {
    const applied = await pool.query<{ version: string }>('SELECT version FROM app_schema_migrations WHERE version = $1', [version])
    if (applied.rowCount) continue
    const migration = await readFile(resolve(process.cwd(), `drizzle/generated/${version}.sql`), 'utf8')
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(migration)
      await client.query('INSERT INTO app_schema_migrations (version) VALUES ($1)', [version])
      await client.query('COMMIT')
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }
}

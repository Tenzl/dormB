import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle/generated',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgresql://dormitory:dormitory@127.0.0.1:5432/dormitory' },
})

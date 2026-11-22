import { defineConfig } from 'drizzle-kit';

// `pnpm --filter @gateflow/api db:generate` writes a migration for any change to the schema.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './migrations',
});

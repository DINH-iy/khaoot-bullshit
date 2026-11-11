import { defineConfig } from 'prisma/config';

// CLI wrapper loads the root .env. Generate/validate also work without credentials.
export default defineConfig({
  schema: 'database/schema.prisma',
  migrations: { path: 'database/migrations' },
  ...(process.env['DATABASE_URL'] ? { datasource: { url: process.env['DATABASE_URL'] } } : {}),
});

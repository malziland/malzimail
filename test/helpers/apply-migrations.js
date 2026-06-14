// Test setup: apply the real migrations/*.sql to the test D1 so the schema is
// identical to production. Runs once per test file (before its tests). The
// migration list is read at config time and injected as env.TEST_MIGRATIONS
// (see vitest.config.js); applyD1Migrations is idempotent.
import { applyD1Migrations, env } from 'cloudflare:test';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

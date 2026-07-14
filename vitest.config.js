// Tests run inside the Cloudflare workerd runtime (official vitest pool),
// so Web APIs like crypto.subtle, btoa/atob behave exactly as in production.
// Runtime options (compatibility_date, flags, bindings) come from wrangler.jsonc.
//
// The test D1 schema is built by applying the REAL migrations/*.sql (read here at
// config time, applied per test file in test/helpers/apply-migrations.js) — so the
// test schema can never drift from production. No hand-written CREATE TABLE in tests.
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      // Generic, committed test config — keeps the suite independent of the real
      // (gitignored) wrangler.jsonc, so CI and any clone can run the tests.
      wrangler: { configPath: './wrangler.test.jsonc' },
      miniflare: {
        bindings: { TEST_MIGRATIONS: await readD1Migrations('./migrations') },
      },
    })),
  ],
  test: {
    setupFiles: ['./test/helpers/apply-migrations.js'],
    // a11y tests live in test/a11y and run in jsdom via vitest.a11y.config.js —
    // they must not be picked up by the workerd pool.
    include: ['test/unit/**/*.test.js', 'test/integration/**/*.test.js'],
    coverage: {
      // istanbul instruments the source at transform time, so it works inside the
      // workerd pool (v8 coverage does not — it reports 0%).
      provider: 'istanbul',
      // *.js only: a bare 'src/**' also sweeps in non-code files (e.g. a stray
      // macOS .DS_Store), which crashes the uncovered-file instrumentation.
      include: ['src/**/*.js'],
      reporter: ['text', 'json-summary'],
      // ≥90% overall, no metric below 80% (branches is the floor).
      thresholds: { lines: 90, statements: 90, functions: 90, branches: 80 },
    },
  },
});

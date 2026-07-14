// Separate Vitest project for accessibility checks: these run axe-core against
// the page markup in jsdom (Node), NOT in the workerd pool the main suite uses.
// Invoked via `npm run test:a11y`.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    include: ['test/a11y/**/*.test.js'],
  },
});

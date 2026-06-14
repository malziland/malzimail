import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'node_modules/**',
      '.wrangler/**',
      'coverage/**',
      // *.html bundles full pages (inline styles/markup); not lintable as JS.
      'public/**/*.html',
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'scripts/**/*.mjs', 'test/**/*.js', '*.config.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.serviceworker,
        ...globals.node,
      },
    },
    rules: {
      // Existing handler signatures keep unused params (request, env, ctx);
      // empty catch is an established best-effort pattern in this codebase.
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // Externalized browser scripts (public/app.js, public/admin.js) — classic
    // scripts in the browser, so browser globals + non-module source.
    files: ['public/**/*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'script',
      globals: { ...globals.browser },
    },
    rules: {
      // Best-effort try/catch (localStorage, clipboard, JSON.parse) intentionally
      // ignores the caught error — same convention as src/.
      'no-unused-vars': ['error', { args: 'none', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
];

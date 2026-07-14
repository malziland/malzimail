# AGENTS.md — Arbeitsregeln für KI-Assistenten

malziMAIL: disposable-mailbox service for workshops on Cloudflare Workers + D1 +
Email Routing, with optional throwaway Google accounts (Cloud Identity).
Single operator per instance. UI and docs are German; code, comments and
commits are English (Conventional Commits).

## Commands

```bash
npm run setup             # one-time local setup assistant
npm run lint              # ESLint (flat config)
npm test                  # Vitest in real workerd runtime (vitest-pool-workers)
npm run test:coverage     # tests + coverage gate (CI enforces >= 80%)
npm run test:a11y         # accessibility checks (axe-core, jsdom)
npm run check             # lint + tests — must be green before any deploy
npm run deploy:dev        # deploy to the test instance (ALWAYS first)
npm run deploy            # deploy to production (only after dev verification)
npm run db:migrate:dev    # apply migrations on the test instance
npm run db:migrate:remote # apply migrations on production
```

## Non-negotiable rules

1. **Never impair the running service.** Order is always: local tests →
   test instance (`deploy:dev`) → production. After ANY `--env` deploy run the
   post-deploy checks in `docs/RUNBOOK.md` (custom domain must still serve
   production).
2. `env.dev` in `wrangler.jsonc` MUST keep `"routes": []` — otherwise a dev
   deploy inherits the top-level routes and hijacks the production domain
   (this happened once; see RUNBOOK).
3. **Never point the domain's MX records to Google** — Cloudflare Email
   Routing is the mail path; changing MX kills mail intake. DNS lives at
   Cloudflare only.
4. No `git push`, release, tag-publish or deploy without the operator's
   explicit approval. Local commits are fine.
5. Secrets never enter the repo (config example uses placeholders only). If a
   committed secret is found: rotate first, clean history second.

## Architecture invariants

- Layering: `src/index.js` (entry only) → `src/routes/*` (handlers) →
  `src/domain/*` (logic) → `src/db/queries.js` (the ONLY place for SQL, bound
  parameters only) · `src/lib/*` (building blocks) · `src/views/*` (HTML).
  Keep files under ~350 lines.
- **CSP has no `unsafe-inline`** — no inline JS/CSS anywhere. The single
  exception is the theme-init snippet allowed via SHA-256 hash: the bytes of
  `THEME_INIT_SNIPPET` (src/views/layout.js), the hash `THEME_INIT_HASH`
  (src/lib/http.js) and the copies in `public/app.html` / `public/landing.html`
  must stay identical — a guard test in `test/unit/finalize.test.js` enforces it.
- Email bodies render via `GET /api/message/:id/frame` in an `<iframe src>`
  with its OWN response CSP (scripts blocked, inline mail styles allowed).
  **Never** rebuild this as `srcdoc` — it would inherit the strict parent CSP.
- "Function follows configuration": Google provisioning is active iff the
  credential chain resolves (`docs/FLAGS.md`). Do not add enable/disable
  checkboxes whose state can drift from real behavior.
  `trainers.google_enabled` is legacy and NOT a gate.
- Design: positive states are TEAL (never green), yellow = stopped,
  red = error, rust = destructive; footer "powered by malziland" is fixed on
  every instance; brand name is written "malziMAIL". See `docs/design-ci.md`.

## Testing notes

- Tests run in workerd, not Node — but the pool does not enforce every edge
  limit (e.g. PBKDF2 iteration cap): green tests ≠ verified live; verify
  runtime-sensitive changes on the test instance.
- The dev instance cannot receive real mail (no domain); the mail path is
  covered by integration tests plus a probe mail after production deploys.
- Optional pre-commit hook: `git config core.hooksPath .githooks` (runs lint).

## Key documents

`docs/RUNBOOK.md` (deploy/rollback/incidents) · `docs/SECURITY-MODEL.md` ·
`docs/FLAGS.md` · `docs/VERIFICATION.md` (evidence matrix) · `docs/adr/`
(decisions incl. deliberate deviations) · `docs/oss-projekt-charta.md`
(quality bar: audits before every release) · `docs/architektur.md`.

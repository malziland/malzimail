# VERIFICATION — Nachweis-Matrix

Bindeglied zwischen Entwicklung und Audits: je Anforderung der exakte Befehl
und das tatsächlich vorliegende Ergebnis (kein Datum ohne Beleg). Bei jeder
Änderung, die einen Nachweis ungültig macht, wird die betroffene Zeile im
selben Change aktualisiert.

**Stand:** 14.07.2026 · Basis-Commit `70a42e8` (main) + Arbeitsstand
„OSS-Standard-Artefakte“ (lokal ausgeführt, macOS/Node laut `.nvmrc`;
CI wiederholt die Läufe bei jedem Push auf Linux).

| Anforderung | Evidenz | Befehl / CI-Job | Ergebnis |
|---|---|---|---|
| Lint sauber | ESLint flat config | `npm run lint` | 0 Fehler, Exit 0 (14.07.2026) |
| Tests grün (echte workerd-Laufzeit) | Vitest + `@cloudflare/vitest-pool-workers` | `npm test` | **23 Dateien, 138 Tests, alle grün** (14.07.2026) |
| Coverage-Gate | istanbul, Schwellen 90/90/90/80 | `npm run test:coverage` | Statements 91,23 % · Branches 80,05 % · Functions 96 % · Lines 94,1 % — über allen Schwellen (14.07.2026) |
| Build reproduzierbar | Wrangler-Bundle ohne Upload | `npx wrangler deploy --dry-run` | Bundle gebaut, „--dry-run: exiting now.“ (14.07.2026); zusätzlich baut jeder Testlauf den Worker in workerd |
| Dependency-Audit (Produktions-Abhängigkeiten) | npm-Advisory-Datenbank | `npm audit --omit=dev --audit-level=high` (auch CI-Job „Audit shipped dependencies“) | „found 0 vulnerabilities“ (14.07.2026) |
| Secret-Scan (volle Historie) | gitleaks | CI-Job „secret-scan“ | CI-Run **29260307883** auf Commit `70a42e8`: success (13.07.2026) |
| Rollback-Probe (Tag aus sich heraus baubar) | frischer `git worktree` auf `v1.0.1` (`53feafb`) | siehe [RUNBOOK.md](RUNBOOK.md) | `npm install` (198 Pakete) · Lint grün · **22 Dateien / 138 Tests grün** · `wrangler deploy --dry-run` ok (14.07.2026) |
| UI-Profil: E2E-Test kritischster Nutzerfluss | Link → Adresse → Mail-Eingang → Lesen → Export, nur über echte Worker-Einstiege | `test/integration/e2e-participant-flow.test.js` (Teil von `npm test`) | grün (14.07.2026) |
| UI-Profil: automatischer Accessibility-Check | axe-core (strukturelle Regeln) auf Teilnehmer-App + Landing | `npm run test:a11y` (auch CI-Schritt) | 2 Tests, 0 Verstöße (14.07.2026). Grenze: `color-contrast` braucht echtes Rendering → Design-Token ([design-ci.md](design-ci.md)) + manueller Test |
| UI-Profil: manueller Tastatur-Smoketest | dokumentiertes Verfahren | [funktionstest.md](funktionstest.md), Abschnitt „Tastatur-Smoketest“ | Verfahren dokumentiert; Durchführung je Release durch Betreiber:in |
| SERVICE_API: Autorisierung fail-closed | Guard-Tests (401/403/410), Token-Bindung der Postfächer, CSRF-Origin-Checks | `test/integration/api.test.js`, `admin-*.test.js` (Teil von `npm test`) | grün (14.07.2026). Dokumentierte Ausnahme: kein Rate-Limit auf `/api/address` → Risikoakzeptanz in [SECURITY-MODEL.md](SECURITY-MODEL.md) |
| Betrieb: Deploy-/Rollback-/Incident-Weg | Betriebs-Handbuch | [RUNBOOK.md](RUNBOOK.md) | vorhanden, Rollback-Weg real geprobt (s. o.) |
| Toolchain gepinnt | `.nvmrc`, committete `package-lock.json` | — | vorhanden. Abweichung „CI nutzt `npm install`“ dokumentiert in [ADR-0001](adr/ADR-0001-grundsatzentscheidungen.md), Punkt 7 |

## Externe Kontrollen (außerhalb des Repos, vom Betreiber zu setzen/prüfen)

- Branch Protection auf `main` mit CI als Pflicht-Check — Status hier nicht verifizierbar.
- GitHub Secret-Scanning + Push Protection aktivieren.
- 2FA für alle Accounts mit Schreibzugriff.
- Cloudflare-Konto: 2FA, minimale API-Token-Rechte.

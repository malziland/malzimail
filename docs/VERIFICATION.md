# VERIFICATION — Nachweis-Matrix

Bindeglied zwischen Entwicklung und Audits: je Anforderung der exakte Befehl
und das tatsächlich vorliegende Ergebnis (kein Datum ohne Beleg). Bei jeder
Änderung, die einen Nachweis ungültig macht, wird die betroffene Zeile im
selben Change aktualisiert.

**Stand:** 29.07.2026 · Commit `baf33ae` (main). Lokale Läufe auf diesem
Stand (macOS, Node v24.12.0); von der CI auf Linux bestätigt (Node v24.18.0
laut `.nvmrc`): Run **30430931922** (success, 29.07.2026).

| Anforderung | Evidenz | Befehl / CI-Job | Ergebnis |
|---|---|---|---|
| Lint sauber | ESLint flat config | `npm run lint` | 0 Fehler, Exit 0; auch mit `--max-warnings=0` sauber (29.07.2026) |
| Tests grün (echte workerd-Laufzeit) | Vitest + `@cloudflare/vitest-pool-workers` | `npm test` | **26 Dateien, 160 Tests, alle grün** (29.07.2026) |
| Coverage-Gate | istanbul, Schwellen 90/90/90/80 | `npm run test:coverage` | Statements 92,13 % · Branches 81,66 % · Functions 97,67 % · Lines 94,93 % — über allen Schwellen (29.07.2026) |
| Build reproduzierbar | Wrangler-Bundle ohne Upload | `npx wrangler deploy --dry-run` | Bundle gebaut (247,02 KiB / gzip 60,85 KiB), „--dry-run: exiting now.“ — mit wrangler 4.115.0 (29.07.2026); zusätzlich baut jeder Testlauf den Worker in workerd |
| Dependency-Audit (Produktions-Abhängigkeiten) | npm-Advisory-Datenbank | `npm audit --omit=dev --audit-level=high` (auch CI-Job „Audit shipped dependencies“) | „found 0 vulnerabilities“ (29.07.2026) |
| Dependency-Audit **inkl. Entwicklungs-Werkzeuge** | npm-Advisory-Datenbank | `npm audit` | „found 0 vulnerabilities“ (29.07.2026) — strenger als das CI-Tor, das Dev-Werkzeuge bewusst ausklammert |
| Installations-Skripte freigegeben | `allowScripts` in `package.json` | `npm approve-scripts --allow-scripts-pending` | keine ungeprüften Skripte; freigegeben: `esbuild`, `workerd`, `fsevents` (29.07.2026) |
| Installation warnungsfrei | frischer `npm install` nach `rm -rf node_modules` | `npm install` | keine Warnungen/Deprecations — geprüft unter Node v24.12.0/npm 11.6.2 **und** v24.18.0/npm 11.16.0 (29.07.2026) |
| Abhängigkeits-Updates laufen unbeaufsichtigt | Sammel-PR + Auto-Merge bei grüner CI | CI-Job `dependabot-auto-merge` | **Scharf verifiziert:** PR **#13** („development-dependencies group with 2 updates“) wurde am 29.07.2026 von `app/github-actions` selbst gemergt, nachdem `check` und `secret-scan` grün waren |
| Secret-Scan (volle Historie) | gitleaks | CI-Job „secret-scan“ | CI-Run **30430931922** auf Commit `baf33ae`: success (29.07.2026) |
| CI-Log frei von Warnungen | vollständiges Log beider Jobs | `gh run view <id> --log \| grep -iE "npm warn\|EBADENGINE\|deprecat\|hint:"` | keine Treffer (Run **30431421129**, 29.07.2026) |
| Live-Deploy verhaltensneutral | Abnahme nach dem Deploy | `curl` auf malzimail.at | Start/Impressum/Datenschutz/AGB/`app.js`/`tokens.css` je HTTP 200 · `/admin` zeigt **„Anmelden"** (nicht den Setup-Assistenten → Prod-DB + Passwort intakt) · CSP weiterhin ohne `unsafe-inline` · Impressum trägt unverändert die Betreiberdaten (29.07.2026, Version `3ac1e230`) |
| Mail-Pfad live (Probemail) | Betreiber-Prüfung am echten Dienst nach dem Deploy — deckt Teilnehmer-Link, Adresserzeugung und Mail-Empfang in einem Durchlauf ab | manuell auf malzimail.at | **Mail kam an; ein Testlogin funktionierte ebenfalls** (Christoph, 29.07.2026, Version `3ac1e230`). Das ist der Nachweis für die einzige Live-Änderung dieses Releases (`postal-mime` 2.7.4 → 2.7.5) — automatisiert nicht abdeckbar, da die dev-Instanz keine Domain hat |
| Test-Instanz vor Live erprobt | Deploy-Reihenfolge dev → prod | `wrangler deploy --env dev`, dann `wrangler deploy` | dev `be130347` grün; **Gegenprobe: malzimail.at blieb während des dev-Deploys auf der Prod-Instanz** („Anmelden"), d. h. die Custom Domain wurde nicht umgebogen (Vorfall 12.06.2026) |
| Rollback-Probe (Tag aus sich heraus baubar) | frischer `git worktree` auf `v1.0.1` (`53feafb`) | siehe [RUNBOOK.md](RUNBOOK.md) | `npm install` (198 Pakete) · Lint grün · **22 Dateien / 138 Tests grün** · `wrangler deploy --dry-run` ok (14.07.2026) |
| UI-Profil: E2E-Test kritischster Nutzerfluss | Link → Adresse → Mail-Eingang → Lesen → Export, nur über echte Worker-Einstiege | `test/integration/e2e-participant-flow.test.js` (Teil von `npm test`) | grün (14.07.2026) |
| UI-Profil: automatischer Accessibility-Check | axe-core (strukturelle Regeln) auf Teilnehmer-App + Landing | `npm run test:a11y` (auch CI-Schritt) | 2 Tests, 0 Verstöße (14.07.2026). Grenze: `color-contrast` braucht echtes Rendering → Design-Token ([design-ci.md](design-ci.md)) + manueller Test |
| UI-Profil: manueller Tastatur-Smoketest | dokumentiertes Verfahren | [funktionstest.md](funktionstest.md), Abschnitt „Tastatur-Smoketest“ | Verfahren dokumentiert; Durchführung je Release durch Betreiber:in |
| SERVICE_API: Autorisierung fail-closed | Guard-Tests (401/403/410), Token-Bindung der Postfächer, CSRF-Origin-Checks | `test/integration/api.test.js`, `admin-*.test.js` (Teil von `npm test`) | grün (14.07.2026). Dokumentierte Ausnahme: kein Rate-Limit auf `/api/address` → Risikoakzeptanz in [SECURITY-MODEL.md](SECURITY-MODEL.md) |
| Betrieb: Deploy-/Rollback-/Incident-Weg | Betriebs-Handbuch | [RUNBOOK.md](RUNBOOK.md) | vorhanden, Rollback-Weg real geprobt (s. o.) |
| Toolchain gepinnt | `.nvmrc`, committete `package-lock.json` | — | vorhanden. Abweichung „CI nutzt `npm install`“ dokumentiert in [ADR-0001](adr/ADR-0001-grundsatzentscheidungen.md), Punkt 7 |

## Externe Kontrollen (außerhalb des Repos, vom Betreiber zu setzen/prüfen)

- Branch Protection auf `main` mit CI als Pflicht-Check — **bewusst nicht gesetzt.** Der Betreiber pusht direkt auf `main`; eine Pflicht-Check-Regel würde das blockieren. Die Schutzwirkung für automatische Updates ist stattdessen in den Workflow gezogen: `dependabot-auto-merge` hat `needs: [check, secret-scan]` und kann ohne beide grünen Jobs gar nicht starten (verifiziert, s. o.). Für ein Team-Setup wäre Branch Protection nachzurüsten.
- GitHub Secret-Scanning + Push Protection aktivieren — Secret-Scanning aktiv, **0 offene Meldungen** (29.07.2026, `gh api .../secret-scanning/alerts`).
- Dependabot-Sicherheitswarnungen + automatische Sicherheits-Fixes — **aktiviert am 29.07.2026**, 0 offene Warnungen.
- Code-Scanning (CodeQL) — nicht eingerichtet. Bewusst offen: würde zusätzliche Meldungen erzeugen, die niemand triagiert.
- 2FA für alle Accounts mit Schreibzugriff.
- Cloudflare-Konto: 2FA, minimale API-Token-Rechte.

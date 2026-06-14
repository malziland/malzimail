# Struktur-Audit — 2026-06-14 (vor Public-Release, Phase-6-Fahrplan)

## ✅ Fortschritt (14.06.2026, alles live, 73 Tests grün)
- **MUSS #1** hashForLog-`await`-Bug gefixt (+ `email()`/`scheduled()`-Tests, die genau diesen Pfad abdecken).
- **MUSS #2** ~770 Z. toter Legacy-Code gelöscht (index.js 1202→1017; pages.js 1416→jetzt Barrel + 3 View-Module).
- **MUSS #3** Doku-Drift gefixt (installation-anleitung Teil G = Assistenten-Flow; konfiguration.md TTL/Token).
- **MUSS #4** SECURITY.md wahr gemacht: CI `npm audit --omit=dev` + `dependabot.yml` (ausgelieferte Deps sauber; 3 high-Advisories sind dev-only).
- **MUSS #5** `email()`/`scheduled()`-Tests ergänzt (vorher null Abdeckung).
- **Struktur:** `pages.js` → `src/views/{layout,legal,admin}.js` (Barrel) · `crypto.js`/`google.js` → `src/lib/`.

## ✅ Tiefe index.js-Zerlegung ERLEDIGT (14.06.2026, live, 73 grün)
Verhaltenserhaltend (verbatim verschoben). **index.js 1017 → 134 Z.**
- `src/db/queries.js` — alle 30 SQL-Statements als benannte `(db, …)`-Funktionen.
- `src/routes/{api,admin,public}.js` — Handler herausgelöst; index.js = nur Entry+Router.
- `src/domain/{address,google,legal,settings}.js` + `src/lib/{util,http}.js` — Domäne/Bausteine; `finalize` in lib/http (importiert `getLegalContext` aus domain/legal, kein Zyklus); `sha256Hex` dedupliziert.
- Live end-to-end verifiziert (Footer-Rewrite, Legal-Dauer, qr, cockpit, CSP, MX, alle Routen).

## ✅ Nachgezogen (2026-06-14, live)
- **CSP komplett ohne `unsafe-inline`.** Alles JS ausgelagert: `public/app.js` (Teilnehmer-SPA) + `public/admin.js` (Admin per `data-action` + delegiertem Listener statt Inline-`onclick`/`<script>`) → `script-src 'self'` ohne Nonces. **Auch `style-src 'self'`:** ~135 Inline-`style=` + 3 Inline-`<style>`-Blöcke in Klassen/verlinkte Stylesheets (`shell.css`/`app.css`/`landing.css`) überführt. Browser-geprüft unter erzwungener CSP (Dashboard+Modal, App, Startseite) — keine Verstöße, kein Layout-Bruch.
- **`finalize()`-Footer-Rewrite entschärft:** matcht exakt `<div>powered by malziMAIL</div>` (statt Substring) → keine Brittleness mehr.
- **PBKDF2-Laufzeit-Bug** beim echten dev-Deploy gefunden: 600 000 Iterationen > Cloudflare-Kappe 100 000 → live 500 beim Login. Auf 100 000 gesenkt, `verifyPassword` schließt fehlschließend, statischer Test sichert die Grenze.

## ⏳ Verbleibende optionale Politur (kein Public-Blocker)
- ~~Tests: Migrationen statt Hand-`CREATE TABLE`~~ **ERLEDIGT (14.06.2026):** Test-Schema aus echten `migrations/*.sql` (`readD1Migrations`/`applyD1Migrations`); fand eine echte Drift (`trainers.secret_hash NOT NULL`).
- Issue/PR-Templates.

---


Multi-Perspektiven-Review (6 Gutachter + Synthese). Bewertet die **Struktur**, nicht die Funktion.

## Gesamturteil: **Note C** (Struktur) · noch **nicht** public-ready

Ehrlich: Christophs Sorge stimmt — es liegt zu viel in zwei Gott-Dateien:
- `src/index.js` (1202 Z.): Worker-Entry + Router + alle API-/Admin-Handler + **alle 42 SQL-Statements** + Krypto-/HTTP-Utils.
- `src/pages.js` (1416 Z.): CSS-Shell + ~25 View-Funktionen, **~1/3 davon toter Legacy-Code**.
- Die im eigenen Konzept geplanten Schicht-Ordner `routes/`, `db/`, `views/` sind **leer**.

**Aber:** Das ist keine Anfängerarbeit. Die schweren Teile sind richtig gemacht — Krypto/Passwörter/JWT audit-fest, View-Funktionen rein, Settings-Kette sauber, Security-Header/CSRF/Verschlüsselung da, 67 Tests grün, Lint sauber. Die Schnittkanten sind klar, der Split ist mechanisch und risikoarm. *„Ein B-Ingenieur auf einer C-Dateistruktur, einen disziplinierten Phase-6-Durchgang von echt professionell entfernt."* Kein Rewrite — ein gut abgegrenzter, verhaltenserhaltender Aufräum-Durchgang.

| Dimension | Note |
|---|---|
| Modularität / Dateigröße | C |
| Architektur / Schichten | C |
| Code-Qualität | C |
| Frontend (app.html) | C |
| Test-Struktur / Abdeckung | C |
| OSS-Reife / Hygiene | B |

## ⚠ Ein echter Bug gefunden
**`index.js:130` — `hashForLog(to)` ohne `await`.** `hashForLog` ist async → es loggt `[object Promise]` statt des anonymisierten Hashes. Die PII-Schwärzung fürs Logging versagt **genau auf dem Pfad (MIME-Parse-Fehler)**, wo man sie braucht. Einzeiler + Test. Liegt in einem **ungetesteten** Zweig — deshalb ist es durchgerutscht.

## MUSS vor Public (zuerst, risikoarm)
1. **[S] hashForLog-`await`-Bug fixen** (+ Test, der PostalMime.parse werfen lässt).
2. **[M] Toten Legacy-Code löschen** (~600 Z.): `renderInactive/renderAdmin/renderAdminDashboard` (+ Aliase `renderCockpit*`), `renderSetupWorkshop/renderSetupDone`, die `/start`+`/stop`-Routen, `handleActivation/handleStop`, `generateTrainerToken`, `activationHours`, `TRAINER_TYPES`, die Legacy-Admin-Aktionen (create/rotate/disable/enable/google_on/off). Beweisbar unerreichbar → null Risiko, schrumpft beide Dateien ~25 %. (Vorher: sicherstellen, dass keine `/start`-Links mehr im Umlauf sind — diese Route nimmt Secret aus der URL = Angriffsfläche bis zur Löschung.)
3. **[M] Doku-Drift fixen** (sonst strandet ein Self-Hoster): `installation-anleitung.md` Teil G sagt noch „Trainer anlegen" (Formular gibt's nicht mehr → Assistent); `konfiguration.md` nennt TTL 24 statt 48 und `ADMIN_TRAINER_TOKEN` statt `default_workshop_token`.
4. **[S] SECURITY.md wahr machen:** behauptet CI-Dependency-Scan, aber es gibt keinen → `dependabot.yml` + `npm audit`-CI-Schritt **oder** Satz entfernen.
5. **[M] Tests für `email()` + `scheduled()`** (aktuell **null** Abdeckung — Kern eines Wegwerf-Maildienstes: Ablauf/Grace-Gate, MIME, AES-GCM-Insert, DSGVO-Aufräum-Cron). Vor dem Datei-Split, damit der Umbau echte Regressionsabsicherung hat.

## SOLLTE (der eigentliche Struktur-Umbau, in Reihenfolge)
6. **[M]** Tests `migrations/*.sql` anwenden statt Hand-`CREATE TABLE` (killt Schema-Drift).
7. **[L]** `src/db/queries.js` — die 42 SQL-Statements zentralisieren (eine Query-Gruppe pro Commit). Macht Domänenlogik unit-testbar.
8. **[L]** Domänenlogik (addresses/workshop/google) aus den HTTP-Handlern ziehen.
9. **[XL]** `index.js` an den vorhandenen Kommentar-Bannern in `routes/{api,admin,public}.js` splitten; `crypto.js`/`google.js`/qr/http nach `src/lib/`. `index.js` → dünner Entry + Routentabelle.
10. **[M]** `pages.js` → `src/views/{layout,legal,admin,setup}.js` (layout.js zuerst). `app.html` Inline-JS/CSS auslagern → `'unsafe-inline'` aus CSP-`script-src` entfernen.

## nice-to-have (mit v1.0.0)
Coverage-Tooling + Schwelle + Badges · ESLint-Schichtgrenzen (gegen Re-Monolithisierung) · Issue/PR-Templates · `finalize()`-Footer-Rewrite durch `htmlShell`-Kontext ersetzen (Perf + Brittleness) · doppeltes `sha256Hex`/Base64-Helper entküpfen · gefangene Fehler-Objekte hinter statischen Labels loggen · Magic-Sentinels (`ALWAYS_ON_UNTIL`, `expires_at===0`) benennen.

## Wichtige Leitplanken (aus dem Vollständigkeits-Check)
- **Jeder** Phase-6-Deploy: erst dev, 67 Tests grün zwischen Commits, danach Live-Domain prüfen (`curl malzimail.at/admin` → „Anmelden") — wegen des `env.dev routes:[]`-Vorfalls.
- Beim Legacy-Löschen `google_enabled` **nicht** wieder als Gate einbauen (Vorfall 13.06.).
- Cookie/Token-Modell (`mzm_t`/`mzm_admin`, HttpOnly+SameSite=Strict) ist gut gemacht — gleicht die `unsafe-inline`-Schwäche teilweise aus.

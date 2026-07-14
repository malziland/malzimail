# ADR-0001 — Grundsatzentscheidungen (rückwirkend festgehalten)

Status: akzeptiert · Datum: 2026-07-14 (Entscheidungen von 06/2026, nachdokumentiert)

## Kontext

malziMAIL ist ein produktiver, öffentlich erreichbarer Wegwerf-Mail-Dienst für
Workshops mit optionaler Google-Konten-Provisionierung, betrieben von einer
Einzelperson, als Open Source für unabhängiges Self-Hosting. Die tragenden
Entscheidungen waren bisher über CHANGELOG, Charta und Doku verstreut; dieses
ADR bündelt sie als Referenz für Weiterentwicklung und Audits.

## Entscheidungen

1. **Stack: Cloudflare Workers + D1 + Email Routing, reines JavaScript (ESM), keine Framework-Abhängigkeit.**
   Gründe: Mail-Empfang, Hosting, DB und Cron aus einer Hand ohne eigene Server;
   kostenloser Betrieb in Workshop-Größenordnung; wenig bewegliche Teile.
   Konsequenz: Laufzeitgrenzen der Edge (z. B. CPU-Zeit) sind Designvorgabe;
   Tests laufen in der echten workerd-Laufzeit (`@cloudflare/vitest-pool-workers`).

2. **Ausbaustufe STANDARD, aktive Profile: SERVICE_API + UI (Projektart Serverless/Edge).**
   Produktiv und öffentlich, aber Solo-Betrieb ohne Regulierungs-Kontext —
   ENTERPRISE-Maschinerie (SBOM, Provenance, CODEOWNERS) wäre Over-Engineering.
   Datenklasse: PII möglich (Mail-Inhalte, absenderbestimmt) plus Zugangsdaten
   (Wegwerf-Google-Logins) → [SECURITY-MODEL.md](../SECURITY-MODEL.md) ist Pflicht.

3. **Versionierung: SemVer mit annotierten Git-Tags (`vX.Y.Z`), CHANGELOG nach Keep-a-Changelog.**

4. **Umgebungskapselung: Toolchain-Pinning statt Dev-Container.**
   Node über `.nvmrc` gepinnt; die maßgebliche Laufzeit ist workerd (über
   Wrangler/Vitest versioniert). Ein Dev-Container brächte für ein
   Solo-Edge-Projekt Komplexität ohne Nutzen.

5. **Task-Einstiegspunkt: npm-Skripte** (`setup`, `lint`, `test`, `check`,
   `deploy`, `db:migrate:*`). Ein separates `build`-Verb entfällt: den Bau
   übernimmt Wrangler beim Deploy (`--dry-run` = reiner Bau-Test); die Tests
   bauen den Worker ohnehin bei jedem Lauf in workerd.

6. **Kein separater Formatter.** Formatierung über `.editorconfig` + ESLint
   (flat config) + Konvention. Ein zusätzlicher Prettier-Lauf brächte einem
   Solo-Projekt mit KI-gestützter Entwicklung keinen Mehrwert; Wiedervorlage,
   falls externe Beiträge (PRs) relevant werden.

7. **CI installiert mit `npm install --no-audit --no-fund` statt `npm ci`.**
   Bewusste Abweichung vom Locked-Install-Ideal: einige Dev-Abhängigkeiten
   bringen plattformspezifische optionale Native-Bindings mit, die eine auf
   macOS erzeugte Lockfile für Linux nicht festhält — `npm ci` schlägt dort
   fehl. Risiko begrenzt durch: committete Lockfile, Dependabot-Updates,
   `npm audit` (Produktions-Abhängigkeiten) und gitleaks in CI.
   Wiedervorlage beim nächsten LANGAUDIT.

8. **Sprachen: Doku und UI Deutsch, Code/Kommentare/Commits Englisch**
   (Commits nach Conventional Commits). Entscheidung „nur Deutsch“ für das
   OSS-Zielpublikum: 11.06.2026.

9. **Sicherheits-Grundsätze:** CSP ohne `unsafe-inline` (einzige Ausnahme:
   Theme-Init per SHA-256-Hash); Mail-HTML nur über die isolierte
   iframe-Route mit eigener CSP (**nicht** auf `srcdoc` zurückbauen);
   „Funktion folgt Konfiguration“ statt Feature-Häkchen
   ([FLAGS.md](../FLAGS.md)); alle SQL-Statements ausschließlich in
   `src/db/queries.js` mit gebundenen Parametern.

## Konsequenzen

Neue Architektur-Entscheidungen oder Abweichungen von diesem ADR bekommen ein
eigenes nummeriertes ADR in diesem Ordner (Kontext → Entscheidung →
Konsequenzen), bevor Code entsteht.

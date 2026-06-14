# malzimail Open Source — Projekt-Charta (Qualitäts- & Architektur-Rahmen)

> ✅ **Stand: v1.0.0 veröffentlicht.** Diese Qualitätsmaßstäbe gelten weiterhin für jede Änderung.

Dieses Dokument steht ÜBER dem Umbau-Konzept ([oss-umbau-konzept.md](oss-umbau-konzept.md)). Es legt fest, welche Qualitätsmaßstäbe von der ersten Zeile an gelten, damit am Ende ein professionelles, erweiterbares Projekt steht — nicht ein „schnell-schnell"-Release. Leitsatz: **Lieber langsamer und sauber als schnell und brüchig. Der laufende Dienst bleibt durchgehend funktionsfähig.**

---

## 1. Qualitäts-Säulen (gelten ab Phase 0, nicht nachträglich)

### 1a. Tests von Beginn an
- **Test-Framework** im Projekt verankern (Vitest + Cloudflare Workers Test-Pool `@cloudflare/vitest-pool-workers` — der offizielle Weg, Worker + D1 lokal zu testen).
- **Jede neue Funktion kommt mit Tests** (Definition of Done, s. u.). Kein Merge ohne grüne Tests.
- Test-Arten:
  - **Unit:** reine Logik (Krypto, Namensgenerator, Settings-Fallback-Kette, Limit-Berechnung).
  - **Integration:** Worker-Endpunkte gegen eine lokale D1-Testdatenbank (Adresse erzeugen, Idempotenz, Mail-Annahme, Ablauf).
  - **Google-Modul:** gegen einen **Mock** (kein echter Google-Call in der CI), plus ein separater, manuell ausgelöster Live-Smoke-Test (Anleitung: [funktionstest.md](funktionstest.md)).
- **Zielabdeckung:** Kernlogik (`src/`) **≥ 90 %** (Statements/Lines/Functions) und **kein Wert unter 80 %** (Branches), gemessen mit **istanbul** (`npm run test:coverage`) und als **CI-Gate erzwungen** (`thresholds` in vitest.config.js — unterschreitet ein Build die Schwelle, wird er rot). Aktuell (Momentaufnahme — exakte, immer gültige Werte via `npm run test:coverage` bzw. CI): **Lines ~94 % · Statements ~92 % · Functions ~96 % · Branches ~81 %**. *(Wichtig: der `v8`-Coverage-Provider meldet im workerd-Pool fälschlich 0 % — daher istanbul, das die Quelle beim Transform instrumentiert.)*

### 1b. Dokumentation wächst mit (nicht am Ende)
- **Pro Phase** wird die zugehörige Doku im selben Schritt geschrieben — nie „später".
- Struktur:
  - `README.md` — Was ist das, Screenshot, Schnellstart, Lizenz, Status-Badges.
  - `docs/installation-anleitung.md` (existiert) — Einsteiger, bebildert.
  - `docs/installation-voraussetzungen.md` (existiert) — Checkliste.
  - `docs/google-phase0-anleitung.md` (existiert) — Google-Setup.
  - `docs/architektur.md` — wie alles zusammenhängt (für Mitentwickler).
  - `docs/konfiguration.md` — alle Settings/Secrets/Vars erklärt.
  - `CONTRIBUTING.md` — wie man mitmacht (Setup, Tests, PR-Regeln).
  - `CHANGELOG.md` — was sich je Version ändert (Format: „Keep a Changelog").
  - `SECURITY.md` — wie man Sicherheitslücken meldet.

### 1c. Recht & Compliance (eigener Phasen-Block, nicht überspielt)
Drei getrennte Fragen, alle vor dem öffentlichen Release zu klären:
1. **Lizenz der Software** (wer darf den Code wie nutzen) — Empfehlung MIT; final entscheiden.
2. **Darf der Dienst betrieben werden?** Wegwerf-Mail + automatische Google-Konten berühren: Google Workspace/Cloud Identity AGB & Acceptable Use Policy, DSGVO (auch wenn „nur Testzweck"), evtl. Jugendschutz. → recherchieren, Risiken auflisten, **Haftungs-/Disclaimer-Text** für Betreiber formulieren.
3. **Haftung des Projekts:** Da andere es selbst betreiben, braucht es eine klare **„Betreiber ist verantwortlich"**-Klausel + Hinweis, dass jede:r selbst die Google-AGB einhalten muss.
- **Ehrliche Grenze:** Claude liefert Recherche + strukturierte Risiken + Textentwürfe, **ersetzt aber keine anwaltliche Freigabe.** Vor dem Public-Release: kurze Rechtsberatung einplanen. Dieser Schritt wird NICHT übersprungen.

### 1d. Sicherheit
- Secrets nie im Code/Repo (`.gitignore` für Schlüsseldateien, `.dev.vars`).
- Service-Account-Schlüssel verschlüsselt in D1 (AES-GCM, vorhanden).
- **Strikte CSP ohne `unsafe-inline` — Pflicht, nicht optional.** Kein Inline-JavaScript (`<script>`, `onclick=` & Co.) und kein Inline-CSS (`style=`, `<style>`) in unserem eigenen Code; alles in externe `public/*.js` / `public/*.css` auslagern. `script-src`/`style-src` bleiben `'self'`. In Tests absichern (CSP-Header) + per Audit erzwingen.
- **Beim Verschärfen der CSP immer prüfen, ob gerenderte Drittinhalte brechen.** Eingehende E-Mail-HTML (inline-gestylt) wird in einem isolierten Dokument mit **eigener** Antwort-CSP gerendert (eigene Route + Header, nicht `srcdoc` — das erbt die Eltern-CSP). Drittinhalt isolieren statt die globale CSP zu lockern.
- Übrige Security-Header (HSTS, X-Frame-Options, Referrer-Policy …) — in Tests absichern.
- `SECURITY.md` + verantwortliche Offenlegung.
- Automatischer Dependency-Check (z. B. Dependabot/`npm audit` in CI) + Secret-Scan (gitleaks) vor jedem Public-Push.

### 1e. Automatisierung (CI/CD)
- **GitHub Actions:** bei jedem Push → Lint + Tests + Secret-Scan (gitleaks) + Dependency-Audit (`npm audit --omit=dev`). Kein roter Build wird gemerged.
- Optional später: automatischer Deploy der Demo-/dev-Instanz aus `main`.

### 1f. Code-Audits (fester Bestandteil des Prozesses)
- **Wann:** nach jeder größeren Phase (mind. nach Phase 3 und 4) sowie verpflichtend **vor jedem Release** (Phase 5/6).
- **Womit:** Ein **eigener Audit-Prompt/-Prozess** (Schwerpunkte: State-of-the-art-Programmierung, Security-Features) wird auf den jeweiligen Stand angewendet; Findings werden als Aufgaben aufgenommen und VOR dem Weiterbauen behoben (nicht „später").
- **Konsequenz fürs Schreiben von Code:** von vornherein audit-fest arbeiten — aktuelle Best Practices, keine Provisorien ohne TODO-Vermerk, Security by Default (Least Privilege, Input-Validierung, keine Geheimnisse im Code, sichere Defaults).
- Ergänzend automatisiert: `npm audit`/Dependency-Check in der CI (siehe 1d/1e).

---

## 2. Architektur „groß gedacht" — erweiterbar von Anfang an

### 2a. Feature-Flags (das von dir gewünschte „Feature-Flex")
- **Ein zentrales Settings-/Flag-System** (die geplante `settings`-Tabelle wird die Grundlage). Jede größere Funktion hängt an einem Flag:
  - Google ist KEIN Flag (verpflichtender Bestandteil, in der Einrichtung via Assistent Schritt 3 erzwungen); das Legacy-Feld `google_enabled` ist nur noch historischer Rest und gated nichts mehr,
  - künftige: z. B. `captcha_enabled`, `custom_branding_enabled`.
- Vorteil: Funktionen können pro Instanz an/aus, ohne Code-Fork. Vorteil: Funktionen lassen sich pro Instanz an/aus schalten, ohne den Code zu forken.

### 2b. Saubere Schichten + professionelle Ordnerstruktur (Wartbarkeit)
- Klare Trennung: **routes → domain → db / lib, Rendering in views.** Heute vermischt in `index.js`/`pages.js`; wird **schrittweise** entflochten — jede Verschiebung durch Tests abgesichert, zuerst auf dev.
- Vollständige Ziel-Ordnerstruktur + Schicht-Regeln + fehlende Standard-Dateien: **[projektstruktur.md](projektstruktur.md)**.
- Jede Datei eine klare Verantwortung. Erleichtert Tests und Beiträge Fremder.

### 2c. Versionierung & Releases
- **Semantische Versionierung** (1.0.0, 1.1.0 …), Git-Tags, GitHub-Releases mit Changelog.
- Migrationen nummeriert und additiv (bestehende Praxis) — nie destruktiv ohne Backup-Hinweis.

### 2d. Erweiterungs-Ideen-Speicher
- `docs/roadmap.md` sammelt Zukunftsideen (Mehr-Sprachen, mehrere Google-Tenants für >50 Konten, andere KI-Dienste, Statistik-Export, Theming). Nicht jetzt bauen — aber sichtbar parken, damit Architektur sie nicht verbaut.

---

## 3. „Definition of Done" (für JEDE Aufgabe ab jetzt)

Eine Aufgabe gilt erst als fertig, wenn:
1. Code geschrieben **und** auf der Test-Instanz erprobt,
2. **Tests** dafür existieren und grün sind,
3. **Doku** aktualisiert (Anleitung/Konfig/Changelog soweit betroffen),
4. **Live-Instanz nachweislich unbeeinträchtigt** (Fallback-Pfad geprüft),
5. kurz im Konzept/Changelog vermerkt, was sich geändert hat.

---

## 4. Neuer Phasen-Fahrplan (Qualität integriert)

Gegenüber dem Umbau-Konzept wird jede Phase um „Tests + Doku + ggf. Recht" ergänzt. Reihenfolge:

| Phase | Schwerpunkt | Qualitäts-Anteil |
|---|---|---|
| **0 — Fundament** | Test-Instanz, **Test-Framework + CI aufsetzen**, Repo-Grundgerüst (README-Stub, CONTRIBUTING, .gitignore, Lizenz-Platzhalter), `docs/architektur.md` Start | Tests/CI BEVOR Features — das ist der „groß denken"-Kern |
| **1 — Settings + Auth** | Settings-Tabelle, Passwort-Setup, Login aus DB, Feature-Flag-Mechanik | Unit-Tests Fallback-Kette; Doku konfiguration.md |
| **2 — Assistent + Branding** | Assistent Schritt 2+3, Betreiberdaten, Impressum aus Settings | Integrationstests Erstlauf; Anleitung aktualisiert |
| **3 — Single-Workshop-UI** | Workshop-Karte, Live-Migration malzimail.at | Tests Adress-/Mailpfad; Live-Smoke-Test dokumentiert |
| **4 — Google im Admin** | Google-Settings, „Verbindung testen" | Mock-Tests Google-Modul; google-Doku |
| **5 — Recht & Härtung** | **Rechtsrecherche + Disclaimer + Lizenz final**, Security-Audit, Dependency-Check, SECURITY.md | eigener Block, nicht übersprungen |
| **6 — Release** | Aufräumen (Hardcodes/Trainer-Code raus), Deploy-Knopf, finale Doku, Public-Repo, v1.0.0 | Realtest: Fremde:r setzt Instanz auf |

Jede Phase = eigener, abgeschlossener, getesteter Stand. (Umbau abgeschlossen — mit **v1.0.0 veröffentlicht**.)

---

## 5. Was NICHT passiert
- Kein „schnell online stellen und später aufräumen".
- Keine Funktion ohne Tests.
- Kein Public-Release ohne geklärte Recht/Lizenz-Frage.
- Keine Änderung, die den laufenden malzimail.at-Dienst gefährdet, ohne vorherigen Test auf der dev-Instanz.

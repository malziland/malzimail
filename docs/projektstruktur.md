# Projektstruktur — Ziel (professionell, geschichtet)

Gehört zur [Projekt-Charta](oss-projekt-charta.md). Beschreibt die **Ziel-Ordnerstruktur** eines reifen Open-Source-Projekts und wie wir **ohne Risiko** dorthin kommen.

## Grundsatz: schrittweise, nicht auf einmal

Die heutige Struktur funktioniert, ist aber „gewachsen": `src/index.js` (~760 Zeilen) macht Routing + Logik + Datenzugriff gemischt, `src/pages.js` (~1000 Zeilen) enthält alle HTML-Seiten. **Wir reißen das NICHT in einem Schritt um** (zu riskant für den Live-Dienst). Stattdessen:

- In **Phase 0** entsteht das **Grundgerüst** (Standard-Dateien, Test-Ordner, CI) — additiv, ändert kein Verhalten.
- In **jeder folgenden Phase** wird genau der Code, den die Phase ohnehin anfasst, in die neue Schicht **verschoben und mit Tests abgesichert**. So wandert die Struktur organisch mit, jede Bewegung einzeln getestet.
- Am Ende (Phase 6) ist die Struktur komplett — ohne dass es je einen ungetesteten Großumbau gab.

---

## Ziel-Struktur

```
malzimail/
├─ README.md                  # Aushängeschild: Was, Screenshot, Schnellstart, Badges, Lizenz
├─ LICENSE                    # MIT (final in Phase 5)
├─ CHANGELOG.md               # „Keep a Changelog“-Format, je Version
├─ CONTRIBUTING.md            # Wie man mitmacht: Setup, Tests, PR-Regeln
├─ SECURITY.md                # Sicherheitslücken melden
├─ CODE_OF_CONDUCT.md         # Verhaltensregeln (Standard: Contributor Covenant)
├─ .editorconfig             # einheitliche Formatierung über Editoren hinweg
├─ .gitignore                # node_modules, .wrangler, .dev.vars, *.json-Keys …
├─ .nvmrc                    # festgelegte Node-Version
├─ package.json              # Scripts: dev, deploy, test, lint, format
├─ wrangler.jsonc            # Cloudflare-Konfiguration
├─ vitest.config.js          # Test-Konfiguration (Workers-Pool)
├─ eslint.config.js          # Linting-Regeln
│
├─ .github/
│  ├─ workflows/ci.yml        # Lint + Tests + Coverage bei jedem Push
│  ├─ ISSUE_TEMPLATE/         # Vorlagen für Bug/Feature-Meldungen
│  └─ PULL_REQUEST_TEMPLATE.md
│
├─ src/
│  ├─ index.js                # NUR Einstieg: fetch/email/scheduled → dünner Router
│  ├─ routes/                 # HTTP-Handler, nach Bereich gruppiert
│  │  ├─ api.js               #   /api/* (Adresse, Messages, Export, QR)
│  │  ├─ admin.js             #   /admin (Login, Aktionen, Dashboard)
│  │  ├─ activation.js        #   /start, /stop
│  │  └─ public.js            #   Landing, Impressum, Datenschutz …
│  ├─ domain/                 # Geschäftslogik (kein HTTP, kein direktes SQL)
│  │  ├─ addresses.js         #   Adresse erzeugen, Namensgenerator
│  │  ├─ workshop.js          #   Aktivieren/Stoppen, Limits, Statistik
│  │  ├─ settings.js          #   Settings + Feature-Flags + Fallback-Kette
│  │  └─ google-accounts.js   #   Konten anlegen/löschen (nutzt lib/google-api)
│  ├─ lib/                    # technische Helfer, wiederverwendbar
│  │  ├─ crypto.js            #   AES-GCM (vorhanden)
│  │  ├─ google-api.js        #   Admin-SDK-Aufrufe (heute src/google.js)
│  │  ├─ qr.js                #   QR-Erzeugung
│  │  └─ http.js              #   jsonResponse, Security-Header
│  ├─ db/                     # Datenzugriffs-Schicht (alle SQL-Statements gebündelt)
│  │  └─ queries.js
│  └─ views/                  # HTML-Rendering (heute alles in pages.js)
│     ├─ layout.js            #   gemeinsames Gerüst + Styles
│     ├─ admin.js             #   Admin-Seiten
│     ├─ workshop.js          #   Aktivierung/Stop
│     ├─ legal.js             #   Impressum/Datenschutz/AGB
│     └─ setup.js             #   Setup-Assistent (neu)
│
├─ public/                    # statische Dateien (unverändert)
│  ├─ app.html  ├─ landing.html  └─ robots.txt
│
├─ migrations/                # D1-Migrationen, nummeriert, additiv
│
├─ test/                      # spiegelt src/
│  ├─ unit/                   #   reine Logik (crypto, names, settings-fallback)
│  ├─ integration/            #   Endpunkte gegen lokale D1-Testdatenbank
│  └─ helpers/                #   Test-Hilfen, Mocks (z. B. Google-API-Mock)
│
├─ scripts/                   # Dev-/Ops-Skripte (vorhanden) — ggf. Test-/Util umbenennen
│
└─ docs/                      # Doku (bereits gut bestückt)
   ├─ architektur.md          #   wie alles zusammenhängt (neu)
   ├─ konfiguration.md        #   alle Settings/Secrets erklärt (neu)
   ├─ installation-anleitung.md   (vorhanden)
   ├─ installation-voraussetzungen.md (vorhanden)
   ├─ google-phase0-anleitung.md  (vorhanden)
   ├─ oss-projekt-charta.md       (vorhanden)
   ├─ oss-umbau-konzept.md        (vorhanden)
   ├─ projektstruktur.md          (dieses Dokument)
   └─ legal/                      (vorhanden, DPA-PDF)
```

## Schicht-Regeln (damit es sauber bleibt)

- **routes/** kennt HTTP, ruft **domain/** auf, rendert über **views/**. Keine Geschäftslogik hier.
- **domain/** ist das Herz: pure Logik, ruft **db/** und **lib/** auf. Kennt kein `Request`/`Response`.
- **db/** ist die einzige Stelle mit SQL. Wenn sich das Schema ändert, ändert sich nur hier etwas.
- **lib/** ist technisch & generisch (Krypto, externe APIs, QR) — keine malzimail-Geschäftsregeln.
- **views/** erzeugt nur HTML aus übergebenen Daten — keine DB-Zugriffe.
- Eine Datei = eine Verantwortung. Jede `domain/`- und `lib/`-Datei ist einzeln testbar.

## Standard-Dateien (in Phase 0 angelegt — vollständig vorhanden)

`README.md`, `LICENSE`, `CHANGELOG.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `.editorconfig`, `.nvmrc`, `vitest.config.js`, `eslint.config.js`, der `.github/`-Ordner (CI-Workflow) und der `test/`-Ordner existieren alle. (Optional offen: Issue-/PR-Templates unter `.github/`.)

## Ehrliche Einordnung

Die Schichtung ist Standard für wartbare Projekte, aber sie hat einen Preis: mehr Dateien, mehr „Hin- und Herspringen" beim Lesen. Für ein 2.600-Zeilen-Projekt, das wachsen und Beiträge Fremder aufnehmen soll, lohnt es sich klar. Für ein Wegwerf-Skript wäre es Overkill — das ist es hier aber nicht.

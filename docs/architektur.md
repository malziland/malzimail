# Architektur (Ist-Stand, wird je Phase fortgeschrieben)

Kurzüberblick für Mitentwickler:innen. Ziel-Struktur und Schicht-Regeln: [projektstruktur.md](projektstruktur.md).

## Laufzeit-Umgebung

Ein einzelner **Cloudflare Worker** (`src/index.js`) mit drei Einstiegspunkten:

| Einstieg | Auslöser | Aufgabe |
|---|---|---|
| `fetch` | HTTP-Anfragen | Routing: `/api/*`, `/admin/*`, Rechtsseiten, `/` (Landing), `/cockpit`→`/admin`, statische Assets |
| `email` | eingehende Mail (Cloudflare Email Routing, Catch-All) | Adresse prüfen (existiert? aktiv? Workshop-Fenster offen?) → Mail parsen (postal-mime) → verschlüsselt in D1 speichern |
| `scheduled` | Cron `0 */6 * * *` | Mails **abgelaufener Adressen** löschen (honoriert `ttlHours` + 48-h-Backstop); abgelaufene Google-Konten beim Tenant löschen |

**Speicher:** D1 (SQLite). Tabellen: `addresses` (bleiben für globale Eindeutigkeit dauerhaft), `messages` (Inhalte AES-256-GCM-verschlüsselt; Aufbewahrung = Adress-Lebensdauer `ttlHours`, Standard 48 h), `trainers` (ein **rotierender Workshop-Token** pro „Start"; „Stopp" deaktiviert + wischt), `settings` (Konfig-Kette: DB → Secret/Var → Default).

**Statische Assets:** `public/` (Teilnehmer-App `app.html`, Landing) über Assets-Binding.

## Module (geschichtet, Stand Phase 6)

| Datei(en) | Verantwortung |
|---|---|
| `src/index.js` (~134 Z.) | Worker-Entry: `fetch`-Router + `email`-Ingestion + `scheduled`-Cron + Test-Re-Exports |
| `src/routes/{api,admin,public}.js` | alle Request-Handler (API, Admin/Setup, Root/Landing) |
| `src/db/queries.js` | **alle** D1-SQL-Statements als benannte `(db, …)`-Funktionen (einzige SQL-Stelle) |
| `src/domain/{address,google,legal,settings}.js` | Domänenlogik: Token/Login-Erzeugung (CSPRNG), Google-Config/Wipe/Stats, Rechtskontext, Settings-Kette inkl. `ttlHours` |
| `src/lib/{crypto,google,http,passwords,util}.js` | Bausteine: AES-GCM+HKDF, Google-SDK (JWT via Web Crypto), HTTP-/Security-Header/`finalize`, PBKDF2, CSPRNG/Hash |
| `src/views/{layout,legal,admin}.js` (+ `src/pages.js` Re-Export-Barrel) | serverseitig gerendertes HTML |

## Sicherheits-Grundzüge

- Security-Header zentral in `lib/http.js` `withSecurity()` (CSP, HSTS, X-Frame-Options …); CSRF-Origin-Check auf Admin-POSTs.
- **Admin-Auth:** Passwort **PBKDF2-600k** (Settings `admin_password_hash`, Fallback Secret `COCKPIT_PASSWORD`); Cookie `mzm_admin` (HttpOnly/Secure/SameSite=Strict); Login-Drosselung pro IP.
- **Verschlüsselung:** Mail-Inhalte + gespeicherter Google-Schlüssel AES-256-GCM, Schlüssel via **HKDF** aus `MAIL_ENCRYPTION_KEY` mit Domänentrennung (`mail`/`google`), Prefix `ENC2:` (Alt-`ENC1:` bleibt lesbar).
- **Postfach-Lesezugriff** (`/api/messages|message|export`) ist an den Workshop-Token gebunden; Teilnehmer-Token/Login per CSPRNG.
- Google-Service-Account-Schlüssel wird im Einrichtungs-Assistenten (Schritt 3, mit „Verbindung testen" + hartem Stopp) verpflichtend konfiguriert und AES-256-GCM-verschlüsselt in den Settings abgelegt; später im Admin per „Google-Konfiguration"-Modal änderbar. Ohne gültige Google-Anbindung lässt sich die Installation nicht abschließen — Google ist fester Bestandteil, kein optionaler Zusatz.
- Keine PII in Logs (Adressen werden gehasht geloggt); **gitleaks** im CI.

## Instanzen

| Instanz | Zweck | Besonderheit |
|---|---|---|
| `malzimail` (Produktion) | malzimail.at, echter Betrieb | Custom Domain + Email Routing |
| `malzimail-dev` (Test) | jede Phase wird hier zuerst erprobt | workers.dev-URL, eigene D1, **kein** Mail-Empfang (keine Domain), eigene Secrets |

Mail-Empfang ist auf dev nicht testbar (keine Domain/MX) — der Mail-Pfad wird stattdessen durch Integrationstests (lokale D1, `cloudflare:test`) abgedeckt; Live-Verifikation per Probemail nach Live-Deploys.

## Tests & Qualität

- **Vitest + `@cloudflare/vitest-pool-workers`** — Tests laufen in der echten workerd-Laufzeit (`npm test`). Struktur: `test/unit`, `test/integration`, `test/helpers`.
- **ESLint** (flat config) — `npm run lint`; beides zusammen: `npm run check`.
- **CI:** `.github/workflows/ci.yml` (läuft bei jedem Push/Pull-Request auf GitHub).

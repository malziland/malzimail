# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/); Versionierung nach [SemVer](https://semver.org/lang/de/), sobald veröffentlicht.

## [Unreleased]

### Tests — echte Migrationen statt Hand-`CREATE TABLE` (2026-06-14)
- Das Test-Schema wird jetzt aus den **echten `migrations/*.sql`** aufgebaut (`readD1Migrations` in vitest.config.js → `applyD1Migrations` in `test/helpers/apply-migrations.js`), statt in jeder Testdatei eigene `CREATE TABLE` zu schreiben. Damit kann das Test-Schema nicht mehr von der Produktion abdriften. Alle 36 Hand-`CREATE TABLE` aus 14 Dateien entfernt, leere `beforeAll`-Hooks aufgeräumt.
- Hat sofort eine **echte Drift gefunden**: `trainers.secret_hash` ist in der Migration `NOT NULL`, die Hand-Schemata erlaubten NULL — Seeds, die `secret_hash` wegließen, wurden korrigiert (das Single-Workshop-Modell nutzt das Feld nicht mehr, Dummy-Wert). 133 Tests grün, Coverage unverändert über den Schwellen.

### Sicherheit — CSP komplett ohne `unsafe-inline` + PBKDF2-Laufzeit-Bug (2026-06-14, live, 133 Tests grün)
- **`script-src 'unsafe-inline'` entfernt** (`src/lib/http.js`). Das gesamte JavaScript ist ausgelagert: die Teilnehmer-SPA nach `public/app.js`, das Admin-Verhalten (Modals, Kopier-/Stopp-Knopf, Live-Zähler, Setup-Prüfung) nach `public/admin.js` (per `data-action`-Attribute + ein delegierter Listener statt Inline-`onclick`). Eingeschleuste `<script>`/`onclick` können nicht mehr ausgeführt werden.
- **`style-src 'unsafe-inline'` ebenfalls entfernt** — die CSP ist jetzt komplett `'self'` ohne jegliches `unsafe-inline`. Alle Stile liegen in verlinkten Stylesheets (`public/shell.css` für die Server-Views, `public/app.css`, `public/landing.css`); die ~135 vormaligen Inline-`style=`-Attribute + 3 Inline-`<style>`-Blöcke wurden in Klassen überführt. (Die Modals schalten weiter über `element.style.display` um — CSSOM-Property-Setter unterliegen der CSP nicht.) Visuell + interaktiv im Browser unter erzwungener CSP geprüft (Dashboard inkl. Stopp-Modal, Teilnehmer-App, Startseite) — keine CSP-Verstöße, kein Layout-Bruch.
- **Folge-Fix (E-Mail-Darstellung):** Ein `<iframe srcdoc>` erbt die strenge Eltern-CSP, wodurch `style-src 'self'` die Inline-Styles **echter eingehender E-Mails** entfernt hätte (kaputte Darstellung im Kern-Feature). Der Mail-Body wird jetzt aus einer **eigenen, isolierten Route `GET /api/message/:id/frame`** geladen (`<iframe src>` statt `srcdoc`), die ihre **eigene** CSP als Antwort-Header trägt: `default-src 'none'` (Scripts komplett blockiert), `style-src 'unsafe-inline'` (die Inline-Styles der Mail rendern), externe Bilder/Fonts blockiert (Privacy — keine Tracking-Pixel/IP-Leaks), `sandbox` + `X-Frame-Options: SAMEORIGIN`. Untrusted Drittinhalt ist damit sauber isoliert (sicherer als zuvor). Im Browser verifiziert (Styles rendern, `<script>` blockiert) + Regressionstests. Ein exhaustiver 25-Agenten-Audit bestätigte: unser eigener Code ist frei von Inline-JS/CSS, dies war der einzige verbleibende Strict-CSP-Befund.
- **PBKDF2-Iterationen 600 000 → 100 000** (`src/lib/passwords.js`). Die Cloudflare-Workers-Laufzeit **kappt PBKDF2 hart bei 100 000** Iterationen (DoS-Schutz, kein Compatibility-Flag) — 600 000 warf live `NotSupportedError`, sodass ein per Setup-Assistent gesetztes Admin-Passwort auf einer echten Instanz nie verifiziert werden konnte (500). Lokal fiel das nicht auf, weil die Test-Laufzeit die Grenze **nicht** erzwingt. `verifyPassword` schlägt jetzt zusätzlich *fehlschließend* (false statt 500) fehl, falls ein gespeicherter Hash je eine zu hohe Iterationszahl trägt. Neuer statischer Test sichert die Obergrenze ab. *(malzimail.at war nie betroffen — dort authentifiziert das Legacy-Secret `COCKPIT_PASSWORD` im Klartext-Vergleich.)*
- ESLint lintet jetzt auch die ausgelagerten Browser-Skripte (`public/**/*.js`, Browser-Globals) statt `public/` komplett zu ignorieren.

### Qualität — Dependencies aktuell + echtes Coverage-Gate (2026-06-14)
- **Dependencies geprüft & aktualisiert:** alle prod-/dev-Pakete auf dem neuesten Stand (eslint 10.4.1 → 10.5.0; postal-mime 2.7.4, qrcode-svg 1.1.0, wrangler 4.100.0, vitest 4.1.8, @cloudflare/vitest-pool-workers 0.16.15, globals 17.6.0; Node 24). Ausgelieferte Deps ohne Schwachstellen (`npm audit --omit=dev`).
- **Test-Coverage jetzt real gemessen & erzwungen:** `@vitest/coverage-istanbul` (der `v8`-Provider meldet im workerd-Pool fälschlich 0 %). `npm run test:coverage` + Schwellen in vitest.config.js (Lines/Statements/Functions ≥ 90 %, Branches ≥ 80 %) als **CI-Gate**. Stand: **Lines 94 % · Statements 91 % · Functions 95 % · Branches 81 %**, 133 Tests.
- Neue Tests zum Schließen der Lücken: `test/integration/public.test.js` (handleRoot-Routing, vorher 0 %), `test/unit/google.test.js` (Admin-SDK-Pfade via echtem RSA-Key + gemocktem fetch, `lib/google.js` 48 % → 93 %).
- README: CI- + Coverage- + MIT-Badge.


### Sicherheit & Datenschutz — Audit-Behebung (2026-06-14, live, 78 Tests grün)
Behebung der echten Bugs aus dem LANGAUDIT (bewusste Design-Entscheidungen ausgenommen):
- **SEC-01** Live-Secrets (`docs/links.md`) aus Tree **und** Git-Historie entfernt, gitignored, gitleaks-Job in CI. *(Secret-Rotation = Betreiber-Aktion.)*
- **SEC-02** Postfach-Lese-/Export-Endpunkte (`/api/messages|message|export`) auf den Workshop-Token gegated (`?t`/`x-trainer-token`/`mzm_t`-Cookie == `address.trainer_token`).
- **SEC-03** Teilnehmer-Link & Google-Login werden per CSPRNG (`crypto.getRandomValues`) erzeugt, nicht mehr `Math.random()`.
- **SEC-04** Admin-Login-Drosselung pro IP (selbstheilend, 8 Fehlversuche → 60 s Cooldown).
- **SEC-05** `?key=ADMIN_KEY` upgradet auf das Cookie + räumt den Key aus der URL (kein History-/Log-Leak mehr).
- **PRIV-01** `/api/export` bekommt dasselbe Ablauf-Gate (410) wie die anderen Reads + `LIMIT`.
- **PRIV-03** Aufräum-Cron löscht Mails nach **Adress-Ablauf** (honoriert `ttlHours`) + 48 h-Hartlimit.
- **PRIV-04 / PRIV-02** Datenschutz nennt bei aktivem Google **Google LLC** (Drittland/SCC) und die technisch notwendigen Cookies (`mzm_t`/`mzm_admin`) + localStorage-Login.
- **BUG-01** Waisen-Google-Konto bei DB-Fehler nach Konto-Anlage wird kompensierend gelöscht.
- **BUG-02** Stopp-Meldung nennt fehlgeschlagene Google-Löschungen (`failed`).
- Offen gelassen, weil **keine Laufzeit-Bugs** (sondern Release-Vorbereitung/Governance, Phase 6): **OPS-01** (betreiber-spezifische Hardcodes in wrangler.jsonc + scripts/ → für generisches Self-Hosting noch zu anonymisieren), **DOC-01** (Charta verspricht Coverage-Badge, der noch fehlt), **DOC-02** (`docs/architektur.md` beschreibt die alte Struktur). *(SEC-02 wurde behoben — Token-Gate —, nicht belassen.)*


### Phase 5 abgeschlossen — Recht & Härtung (2026-06-14, live)
- **5c Krypto-Härtung:** Schlüssel jetzt via **HKDF-SHA256 mit Domänen-Trennung** (`mail` vs. `google`) aus `MAIL_ENCRYPTION_KEY` (statt einfachem SHA-256, ein Schlüssel für alles). Migrationssicher: neue Daten `ENC2:`, alte `ENC1:` bleiben über den Legacy-Schlüssel lesbar. HKDF statt PBKDF2, weil das Master-Secret hochentropisch ist (PBKDF2-Iterationen würden pro Request laufen). API: `makeCipher/cipherEncrypt/cipherDecrypt`.
- **5d Recht:** **MIT-Lizenz** (`LICENSE`, package.json, README) + **Haftungsausschluss** (Software „as is", Betreiber selbst verantwortlich für DSGVO/Impressum/ToS).
- **5e Sicherheits-Selbst-Audit** ([docs/security-audit-2026-06-14.md](docs/security-audit-2026-06-14.md)): SQL nur gebundene Parameter ✓, Mail-HTML im **gesandboxten iframe** (kein `allow-scripts`) ✓, XSS via `escape()`/`textContent` ✓, CSP restriktiv ✓, gehashte Logs ✓. **Behoben:** PBKDF2-Iterationen 100k → **600k** (OWASP 2023). Rest-Risiken dokumentiert (CSP `unsafe-inline`, kein Rate-Limit auf `/api/address` — by design).


### Geändert (Umbau: rotierender Wegwerf-Link statt fester Token, 2026-06-14, live)
- **„Workshop starten" erzeugt jedes Mal einen frischen, rotierenden Teilnehmer-Link** (Tier-Token Variante B, z. B. `marder9530-5wq`): eigene Tierliste `LINK_WORDS` (überschneidungsfrei zu den E-Mail-Tieren) + 4 Ziffern + 3 Zufallszeichen (nicht erratbar). Beim Start werden alle alten Links deaktiviert → genau ein aktiver Link. Tokens bleiben gespeichert → nie doppelt.
- **Keine feste Laufzeit / kein Countdown mehr:** ein Workshop läuft, bis er gestoppt wird (`active_until` = weit in der Zukunft). Status nur noch „läuft" / „kein Workshop aktiv".
- **„Workshop stoppen" wischt alles** (Warnung + Spinner, via fetch/JSON): alle Google-Konten gelöscht, alle Sitzungen zurückgesetzt (Postfächer geleert), Link wird tot. Der separate „Alle Google-Konten löschen"-Knopf entfällt (Stopp übernimmt ihn, `wipeAllSessions`).
- **Toter/alter Link → Startseite** statt Inactive-Seite (`handleRoot` liefert die Landing).
- **Setup ohne Token-Eingabe:** der Assistent endet nach den Betreiberdaten (Schritt 2 von 2); der Link entsteht erst beim ersten „Start". `setup_workshop` entfernt.
- **Max. Lebensdauer 48 h** (Adresse + Mails), unsichtbar (Cron räumt auf) — erlaubt Aktivierung am Vortag. `ADDRESS_TTL_HOURS=48`, Rechtstexte folgen automatisch (48 Stunden).
- **Dashboard-Statistik:** obere „Heute/Gesamt"-Zeile raus; übrig nur der kompakte Live-Zähler „Google-Konten aktiv: X von Y · Z frei" (nur wenn Google konfiguriert).
- Tests: rotierender Token (Format + Disjunktheit), Start/Stopp-Backend, Setup-ohne-Token; End-to-end auf dev verifiziert (Setup→Start→Link→Stopp→toter Link→Landing). **Live-Migration:** die alte `malziland`-Zeile ist noch „aktiv" — beim ersten „Stopp"/„Start" im Admin wird sie deaktiviert und der alte Link tot.


### Hinzugefügt / Geändert (Notfall-„alle löschen" + Schlüssel-Anzeige raus, 2026-06-13, live)
- **Notfall-Knopf „Alle Google-Konten löschen"** in der Zähler-Karte (rote Umrandung, roter Text) mit **Bestätigungs-Modal im eigenen Design** (rot, 🚨). Action `delete_google_all`: löscht **alle** aktuell hinterlegten Google-Konten bei Google (ein Token für alle via `deleteGoogleUsers`), leert die Login-Spalten; Mail-Postfächer unberührt. Meldung nennt Anzahl gelöscht/fehlgeschlagen.
- **Schlüssel-Anzeige entfernt:** Unter „Google ist eingerichtet" wird die Service-Account-/Schlüsselkennung **nicht mehr angezeigt** (Wunsch Christoph). `keyEmail`/`keyId` als toter Code aus `renderGoogleModal` + dashboard-`google`-Objekt entfernt.
- Verifiziert: die „13 aktiv"-Anzeige war **korrekt** (13 Test-Konten von heute, alle <24 h, 8 noch auf alter Domain `id.malzimail.at`). Tests: Löschen leert Spalten / No-op ohne Schlüssel / Auth nötig / keine Schlüssel-Anzeige. 59 grün.

### Geändert (Auto-Test beim Speichern der Google-Konfig, 2026-06-13, live)
- **Speichern testet jetzt automatisch** die Verbindung (`testGoogleConnection`), **bevor** das Modal schließt. Das Modal schließt **immer** (egal ob Test ok/fehlgeschlagen); die Flash-Meldung nennt das Ergebnis („Gespeichert · Verbindung erfolgreich getestet ✓" bzw. „… fehlgeschlagen (step · HTTP …)").
- Ergebnis wird in Settings persistiert (`google_last_test_ok`, `google_last_test_at`) — auch beim manuellen „Verbindung testen". Dadurch **kennt das System** den echten Status, nicht nur der Mensch.
- Dashboard-Google-Karte zeigt 3-stufig: **● verbunden** (grün) · **● Verbindung fehlgeschlagen** (orange) · **● eingerichtet** (noch nicht getestet, z. B. Secret-Instanz) · **● nicht eingerichtet** (rot). Test: Speichern testet + schreibt Status + schließt trotzdem.

### Hinzugefügt (Live-Zähler Google-Konten, 2026-06-13, live)
- Im Admin zeigt die Google-Karte **„Google-Konten aktiv: X von 50 · noch Y frei"**. Zahl = `COUNT(*) addresses WHERE google_login IS NOT NULL` = die bei Google real existierenden Konten (angelegt, vom Cron noch nicht gelöscht) — keine Google-API nötig.
- **Live:** Poll alle 15 s auf den authentifizierten JSON-Endpunkt `/admin?fragment=google-count` (`{active, limit, free}`); pausiert bei verstecktem Tab. Steigt sofort mit jeder Teilnehmer-Linköffnung.
- Limit als Setting **`google_account_limit`** (Default 50, Gratis-Limit Cloud Identity). Anzeige ist ein **Richtwert** (Admin-Konto/Reste zählen bei Google zusätzlich). Tests: Zähler + Auth-Schutz.

### Geändert (Google-Konfig als Modal + Markenname, 2026-06-13, live)
- Die Google-Konfiguration ist keine eigene Seite (`/admin/google`) mehr, sondern ein **Modal über dem Admin-Dashboard** (Hintergrund = unscharfes Admin). Speichern → schließt + Erfolgsmeldung; Abbrechen → schließt nur; „Verbindung testen" im Modal. `save_google`/`test_google_form` posten an `/admin` (vor dem Token-Guard, da tokenlos).
- **Markenname überall als `malziMAIL`** (MAIL groß) im angezeigten Text (Brand-Marke, Titel, Footer, Rechtstexte, Service-Name-Default). Technisch klein belassen: Domain `malzimail.at`, E-Mail-Adressen, localStorage-Schlüssel, Worker-/D1-Name, Export-Dateiname. Footer-Ersatz auf der Original-Instanz mitgezogen.
- Teilnehmerseite: Intro-Hero-Text entfernt (bleibt auf der Startseite).

### Hinzugefügt (Phase 4 — Google-Konfiguration im Admin + Verbindungstest, 2026-06-13)
- **`resolveGoogleConfig`** (4a): Vorrang-Kette **DB-Settings → Worker-Secret → keins**; der Service-Account-Schlüssel wird **AES-GCM-verschlüsselt** in der DB abgelegt (nie Klartext). Leere Settings = unverändertes Secret-Verhalten (live-sicher). Live verifiziert (Google-Login wird weiter erzeugt).
- **Admin-Seite `/admin/google`** (4b): Formular für Admin-Subject, Konto-Domain und SA-Schlüssel (verschlüsselt gespeichert, nie zurückgezeigt); Status zeigt die Quelle (Formular / Secret / nicht konfiguriert). Verlinkt aus der Google-Status-Zeile im Dashboard.
- **„Verbindung testen"** (4c): `testGoogleConnection` macht einen **read-only** Aufruf (Token holen + `users.list?maxResults=1`) — legt nichts an — und meldet OK/Fehler mit Detail. Endpunkt live gegen den echten Schlüssel verifiziert (echt → ok, falsch → Fehler).
- Tests: Vorrang-Kette + Verschlüsselungs-Roundtrip + Admin-Seite (Speichern verschlüsselt, Auth nötig, ungültiges JSON → 400) — gesamt 52 grün.

### Hinzugefügt (Eine Identität: Adresse = Google-Login, 2026-06-13, live)
- **Mail-Adresse und Google-Login sind jetzt EINE Adresse** `wort1234@malzimail.at` — kein zweites „id."-Konto mehr. Der Teilnehmer hat eine Adresse, die das Postfach **und** der Google-Login ist.
- **Wie:** `malzimail.at` als **sekundäre Domain im Cloud-Identity-Tenant** per TXT verifiziert (Google braucht ohne Gmail keine MX). **MX bleiben auf Cloudflare** → Mail unverändert, Postfach weiter über Cloudflare/D1. `GOOGLE_ACCOUNT_DOMAIN: id.malzimail.at → malzimail.at` (Admin-Subject bleibt `admin@id.malzimail.at`). Offiziell dokumentiertes Google-Muster (Cloud-Identity-Konten + externes Mailsystem).
- **App (`app.html`):** Adresse einmal; Karte „Mit Google anmelden" zeigt **E-Mail-Adresse** (= Login) + **Passwort**, beide beschriftet. `APP_VERSION → 2026-06-13-onelogin`.
- **Teilnehmerseite verschlankt:** „So machst du weiter"-Hinweis und der gesamte Block **„Bestehende Adresse wieder öffnen"** entfernt (inkl. aller JS-/CSS-Reste: `onReopen`, `els.reopen*`, `.reopen-row`).
- **Karten-Politur:** Nummern-Badges (1/2) raus; „Deine Adresse" + „Posteingang" zu **einer** umrandeten Karte zusammengeführt (lila Rand + Briefumschlag-Badge, als Gegenstück zur türkisen Google-★-Karte). **Startseite:** „So funktioniert's 1-2-3" entfernt; das Vorschau-Mockup an das neue Design angeglichen (eine Adresse @malzimail.at, kein Refresh-Icon).
- **Live verifiziert:** Konto-Anlage auf malzimail.at ✅, Adresse == Login ✅, **Mail-Empfang an der Adresse bestätigt ✅**, MX unverändert ✅, alle HTML-Pfade 200 ✅. Reversibel (`GOOGLE_ACCOUNT_DOMAIN` zurück + Deploy).
- **Offen:** Intro-Texte (`app.html`/`landing.html`) erwähnen den Google-Login noch nicht; „Kein Login"-Häkchen + „24 Stunden" sind jetzt missverständlich → Wortlaut mit Christoph abstimmen (Teil der Phase-5-De-Personalisierung).

### Geändert/Behoben (Security: keine Selbst-Verlängerung der Laufzeit, 2026-06-13, live Version f0788667)
- **„Neue Adresse"-Button (↻) auf der Teilnehmerseite komplett entfernt** — inkl. **aller** toten Reste: Click-Handler, `els.new`, Confirm-Dialog, Spin-Animation-CSS (`.is-spinning` + `@keyframes spin`) und der Hinweistext, der noch auf den Knopf verwies. Teilnehmer:innen können keine neue Adresse mehr erzeugen — sie wird weiterhin **automatisch beim Öffnen** angelegt. `onNewAddress(silent)` bleibt nur für die automatische Erst-Erzeugung + den stillen Inaktiv-Retry. Damit ist die Selbst-Verlängerung (jeder Refresh = frische 24 h) ausgeschlossen.
- **Ablaufzeit folgt dem Trainer:** `expires_at = min(jetzt + TTL, Workshop-Ende)` (`index.js`). Live verifiziert: neue Adresse lief in **18,96 h** ab (= Restzeit des Workshops), nicht 24 h. Keine Adresse überlebt das Workshop-Ende. Test in `address-google.test.js` (Ablauf ≤ Workshop-Ende). 45 grün.
- `APP_VERSION` → `2026-06-13-capped` (verwirft alte gespeicherte Adressen → frische, gedeckelte Adresse beim nächsten Laden).
- Live-Check bestanden: alle HTML-Pfade 200, Refresh-Button weg, Google end-to-end (Adresse + Login), Domain auf Prod.
- **Offen (eigene Schritte):** (a) **Früh-Stopp:** bei manuellem Stopp mitten in der Sitzung bleibt die Restzeit einer schon erzeugten Adresse auf dem ursprünglichen Ende eingefroren (API liest bis dahin weiter) — falls die Zeit auch dann **dynamisch** dem Trainer folgen soll: Lese-Endpunkte gegen aktuelles `active_until` + Klärung 10-Min-Toleranz. (b) Getrennter „Google aktualisieren"-Knopf (Christophs Idee) = Datenmodell-Entkopplung Adresse↔Google.

### Behoben (Stale-State / „Cache" Safari↔Brave, 2026-06-13, live)
- **Symptom:** In Safari erschien die alte `ws-`-Adresse ohne Google, in Brave die neue mit Google.
- **Diagnose:** **Kein** HTTP-Cache-Problem — alle Antworten sind bereits `no-store` (per `curl` verifiziert: `/`, `/?t=…`, `/admin`, `/api/*`). Ursache war die **im Browser gespeicherte Adresse** (localStorage `malzimail.address`): Safari hatte noch eine Adresse aus dem kaputten Google-Fenster, Brave war frisch.
- **Fix 1 (Client-State-Buster):** `app.html` führt eine **App-Versionsmarke** (`malzimail.appver`, aktuell `2026-06-13-google`). Stimmt sie beim Laden nicht, werden gespeicherte Adresse + Google-Login verworfen → Teilnehmer bekommt frisch eine (Google-)Adresse. Bei künftigen Deploys mit potenziell veraltetem Client-State einfach `APP_VERSION` erhöhen.
- **Fix 2 (HTTP-Härtung, defensiv):** `withSecurity()` setzt jetzt **zentral** für alle HTML- und JSON-Antworten `cache-control: no-store, must-revalidate` (+ `pragma`/`expires`) — unabhängig davon, was die Asset-Auslieferung mitgibt. Bilder (QR) dürfen weiter cachen. Test in `finalize.test.js` (HTML + JSON → no-store). 44 grün.
- Live verifiziert (Version `fd5f99b8`): alle Pfade 200, `no-store`, `APP_VERSION` ausgeliefert. **Für die eigene Safari-Sitzung genügt einmal Neuladen** — dann greift die Versionsmarke und die alte Adresse verschwindet.

### Behoben (Vorfall: Google-Konten fehlten Teilnehmern, 2026-06-13, live)
- **Symptom:** Auf der Teilnehmerseite erschien kein Google-Login mehr, obwohl das Admin „Google aktiv" zeigte.
- **Ursache (Inkonsistenz aus Phase 3):** Beim Entfernen des per-Trainer-Google-Schalters (Entscheidung „Google ohne Häkchen — folgt der Konfiguration") wurde der **Server-Gate nicht angepasst**: `/api/address` verlangte weiter `trainer.google_enabled` UND `googleConfig(env)`, während das Dashboard „aktiv" nur an `googleConfig(env)` festmachte. Auf Live stand `malziland.google_enabled = 0`, und die UI bot keinen Weg mehr, es einzuschalten → Dashboard sagte „aktiv", Teilnehmer bekamen nichts.
- **Sofort-Reparatur:** `google_enabled = 1` für `malziland` in der Prod-DB gesetzt → Live mit dem damals deployten Code sofort wiederhergestellt; per echtem API-Probelauf verifiziert (Adresse **+** Google-Login).
- **Code-Fix (gegen Wiederholung):** `/api/address` provisioniert Google jetzt rein anhand `googleConfig(env)` — derselben Bedingung, die das Admin als „aktiv" anzeigt. Das Legacy-Feld `google_enabled` ist damit kein verstecktes Gate mehr; Dashboard und Verhalten können nicht mehr auseinanderdriften. 2 Regressionstests (`test/integration/address-google.test.js`): ohne Config → klassische Adresse; mit Config → Google-Versuch trotz `google_enabled=0`. Gesamt 43 grün.
- **Live verifiziert** (Version `2b0fe914`): alle HTML-Pfade 200, Google end-to-end erzeugt Adresse + Login. (Test-Konten löscht der Cron in 24 h.)

### Behoben (Vorfall: 500 auf Asset-Seiten, 2026-06-13, live)
- **`finalize()` ließ den Antwort-Stream „disturbed" zurück:** Es las `response.text()` (für die Footer-Ersetzung), baute die Antwort aber nur neu, wenn „powered by malzimail" vorkam. Auf der nicht-konfigurierten Produktions-Instanz enthalten die **Asset-Seiten** (Landing `/`, Teilnehmer `/?t=…`, da Footer bereits „malziland") diesen Marker nicht → keine Neukonstruktion → der bereits gelesene Stream ging an `withSecurity` → `TypeError: ReadableStream is disturbed` → **HTTP 500**. htmlShell-Seiten (/admin, /impressum) enthalten den Marker und funktionierten zufällig — deshalb beim Footer-Deploy nicht aufgefallen.
- **Fix:** Nach dem Lesen wird die Antwort **immer** aus dem gelesenen Text neu gebaut (egal ob ersetzt wurde). 4 `finalize()`-Regressionstests (Body ohne Marker crasht nicht, Ersetzung, konfiguriert bleibt neutral, Nicht-HTML unverändert) — gesamt 41 grün. Live behoben (Version `7dfd1529`), alle Pfade geprüft: `/`, `/?t=malziland`, `/admin`, `/impressum` → 200.
- **Zeitfenster:** seit dem Footer-Deploy (`efecb6a1`) bis `7dfd1529` (wenige Minuten) lieferten Landing + Teilnehmerseite 500. **Lehre:** nach Änderungen an der Response-Pipeline ALLE Seitentypen prüfen (besonders Asset-Seiten ohne htmlShell), nicht nur die, die zufällig den Marker enthalten.

### Geändert (Admin-Header schlanker + Teilnehmer-Auto-Recovery, 2026-06-13, live Version efecb6a1→7dfd1529)
- **Admin:** die Überschrift „<Dienst> · Admin" entfernt (Logo + Kontext im Header reichen, „Admin" ist redundant). Die Status-Box steht jetzt ganz oben.
- **Teilnehmerseite (`app.html`) – „Adresse abgelaufen" heilt sich selbst:** Eine gespeicherte, über 24 h alte Adresse führte bisher in eine Sackgasse (alle Timer gestoppt) — die Seite blieb auch nach dem Starten des Workshops auf „abgelaufen" hängen. Neu: abgelaufene Adresse holt **automatisch** eine frische; ist der Workshop noch nicht aktiv, versucht die Seite alle 12 s **leise im Hintergrund** erneut und erwacht von selbst, sobald der Workshop startet (zusätzlich sofortiger Versuch beim Zurückkehren in den Tab). Inaktiv-Hinweis umformuliert: „… erscheint deine Adresse hier automatisch." Bedienknöpfe werden bei Wiederherstellung sicher reaktiviert.
- Tests: Dashboard-Titel-Assertion angepasst (Service-Name jetzt im `<title>`), 37 grün. Inline-JS syntaxgeprüft. Auf `malzimail-dev` deployt; Live unberührt.

### Geändert (Footer-Credit instanzabhängig, 2026-06-13, live)
- **„powered by …" folgt jetzt der Instanz:** nicht-konfigurierte Instanz (die originale malziland/COMPANY-Installation) → **„powered by malziland"**; konfigurierte OSS-Instanz behält das neutrale **„powered by malzimail"**. Umgesetzt an einer Stelle (`finalize()` im Haupt-Handler, ersetzt den Footer-Text vor dem Ausliefern abhängig von `getLegalContext().configured`) — `pages.js` bleibt unverändert (neutraler Default), kein neues Setting nötig.
- Test: Footer = „malziland" ohne Betreiber / = „malzimail" mit Betreiber — 37 grün. Auf malzimail.at deployt (Version `efecb6a1`), Verhaltens-Check bestanden.

### Live (Phase 3 Etappe 2 — Workshop-Karte auf malzimail.at, 2026-06-13)
- **Etappe 1 komplett auf malzimail.at deployt** (Version `6b064c49`): Workshop-Karte statt Trainer-Verwaltung, dauerhafte Status-Box (grün/gelb/rot), gelbes Stopp-Modal, grünes Outline statt Verlaufs-Buttons, vergrößerter QR, settings-getriebene/de-personalisierte Rechtsseiten + Footer.
- **Migration:** `default_workshop_token = 'malziland'` in die Prod-Settings geschrieben → der bestehende Teilnehmer-Link `/?t=malziland` bleibt unverändert.
- **Verhaltens-Check nach Deploy (Vorfall-Regel):** `/admin` → „Anmelden" (kein Assistent) ✓ · `/?t=malziland` → 200 ✓ · `/impressum` → unveränderte COMPANY-Daten (GISA 33320410, Christoph Krieger) ✓ · Custom Domain blieb auf der Prod-Instanz ✓.
- Rechtsseiten zeigen auf Live weiterhin die bisherigen COMPANY-Daten (Prod-Settings für `operator_owner` leer → COMPANY-Fallback; nur der Footer ist neutralisiert auf „powered by malzimail").

### Geändert (Phase 3 Etappe 1 — Verlaufs-Buttons raus, 2026-06-13, nur dev)
- **Alle Verlaufs-Buttons (lila→türkis Gradient) durch grünes Outline ersetzt** — einheitlich wie „Workshop starten": Anmelden, Passwort festlegen, alle Setup-Schritte, „Passwort ändern", „Zum Admin"; auch der „Öffnen"-Button auf der **Teilnehmerseite** (`app.html`) und die Legacy-Admin-Knöpfe. `.btn--primary` ist jetzt grün (Rand `rgba(16,185,129,.55)`, Text `--success`), inline-Gradient-Overrides entfernt.
- Reine Deko-Verläufe bleiben (kein Button): Überschriften-/Marken-Text (`.gradient`/`.accent`), Schritt-Nummern-Kreise, das Info-Panel auf der Startseite. Die **Startseite** (`landing.html`) hatte gar keinen Verlaufs-Button.

### Geändert (Phase 3 Etappe 1 — Politur Workshop-Karte, 2026-06-13, nur dev)
- **Dauerhafte Status-Box ganz oben** (statt kleiner Status-Pille): zeigt den Zustand bei jedem Aufruf — auch beim bloßen Neuladen — **grün** „✓ Workshop läuft · Restzeit", **gelb** „⏸ Workshop gestoppt", **rot** „⛔ gesperrt". Der Zustand kommt aus den Daten, nicht aus einer flüchtigen Meldung.
- Grüner „Workshop gestoppt."-Flash entfernt (war fälschlich grün für einen Stopp-Hinweis) — die gelbe Status-Box übernimmt die Rückmeldung.
- Start/Stopp-Knopf sitzt jetzt neben der „Workshop"-Überschrift.
- QR-Code im Modal vergrößert (bis 420 px); Stopp-Bestätigung als eigenes **gelbes Warn-Modal** statt Browser-Dialog (s. vorherige Etappe).
- Tests: Status-Box-Assertion + Reload-Persistenz — 36 grün. Live unberührt (Domain-Check ✓).

### Hinzugefügt (Phase 3 Etappe 1 — Workshop-Karte, 2026-06-13, nur dev)
- Admin zeigt statt Trainer-Verwaltung **eine Workshop-Karte**: Status-Pill (aktiv/inaktiv + Restzeit), ▶ Starten/⏹ Stoppen als Buttons, **„Teilnehmer-Link anzeigen"**- und **„QR-Code anzeigen"**-Umschalter (eingeklappt), Kopieren-Knopf, Statistik (heute/gesamt), Google-Status-Zeile (nur Anzeige — folgt der Konfiguration), Links zu Passwort ändern/Abmelden. Akzentfarben statt Standard-Blau.
- Auflösung des Standard-Workshops: settings `default_workshop_token` → `ADMIN_TRAINER_TOKEN` (Live-Übergang) → erster Datensatz.
- Alte Trainer-UI (anlegen/sperren/löschen/rotieren/Google-Schalter) aus der Oberfläche entfernt; Backend-Routen bleiben bis Phase 6.
- Tests: Dashboard-Assertions (Karte da, Trainer-UI weg, Start/Stopp-Zyklus) — 36 grün. Live unberührt (Domain-Check ✓).
- **Offen (Etappe 2, nach Abnahme):** Live-Deploy + Migration (`default_workshop_token='malziland'`); Rechtsseiten behalten auf Live den COMPANY-Fallback (Settings bleiben leer → GISA/UID bleiben sichtbar; volle Settings-Übernahme erst Phase 6, wenn Register-Felder konfigurierbar werden).

### Geändert (Phase 2 — Nachbesserungen Setup & Rechtsseiten, 2026-06-12)
- **Rechtsseiten vollständig settings-getrieben (Teil der De-Personalisierung, aus Phase 5 vorgezogen):** Impressum/Datenschutz/AGB nutzen bei konfiguriertem Betreiber ausschließlich dessen eigene Daten — Dienst-Name, Adresse, Kontakt, „Stand"-Datum (= Installationsdatum). Die österreichischen Registerdaten (GISA/UID/FN) werden dann **komplett ausgeblendet** statt auf COMPANY zurückzufallen. Ohne Betreiber-Konfiguration (Produktions-Instanz) bleibt alles unverändert (COMPANY-Fallback).
- Globaler Footer neutralisiert: „powered by malziland" → „powered by malzimail".
- Generisches Wording: „Trainer-Link" → „Workshop-Link", Limit-/Kontingent-Klauseln entfernt (passend zu „keine Pflicht-Limits").
- Setup Schritt 2: Adresse als **getrennte Pflichtfelder** (Straße / PLZ / Ort), alle Felder erforderlich (Client- + Server-Prüfung); Installationsdatum wird als `operator_legal_date` gespeichert.
- Wording: „Workshop erstellen" → „Einrichtung abschließen"; Assistent-Titel „malzimail einrichten" → „Dienst einrichten".
- Tests: De-Personalisierungs-Check (Rechtsseiten zeigen Betreiberdaten, keine Fremd-Register-Nummern) + Pflichtfeld-Guard — gesamt 36 grün. Auf `malzimail-dev` verifiziert.
- **Offen (bewusst Phase 3):** Admin-Dashboard-Politur (Trainer-Sektion raus, Link/Code-Umschalter, Farben) — wird dort durch die Workshop-Karte ersetzt.

### Hinzugefügt (Phase 2 — Setup-Assistent komplett, 2026-06-12)
- Assistent Schritt 2 (Betreiberdaten → Settings) + Schritt 3 (Workshop-Link/Token wählen → legt den einen Workshop an: Admin = Trainer, ohne Limits, `google_enabled=1`).
- Abschluss-Seite mit Workshop-Link + QR + Start/Stopp-Link; danach `default_workshop_token` + `setup_completed=1` gesetzt.
- Impressum/Datenschutz/AGB lesen Betreiberdaten aus Settings (Overlay über die `COMPANY`-Fallback-Defaults). Hinweis: detaillierte AT-Registerdaten (GISA/UID/FN) fallen noch auf COMPANY zurück — volle De-Personalisierung in Phase 5.
- Slider-Vorbereitung: Aktivierungs-Dauer über Settings-Kette (`workshop_hours` → `ACTIVATION_HOURS` → Default) statt fest verdrahtet.
- Tests: Integrationstest des kompletten Assistenten-Durchlaufs + Live-Sicherheits-Test (Legacy-Passwort → kein Assistent) — gesamt 36 grün.
- Auf `malzimail-dev` erprobt (frischer Assistent) und — im Zuge der Vorfall-Behebung (s. u.) — auf malzimail.at deployt; Live verhält sich unverändert (Login wie bisher, Assistent erscheint nie, Impressum = bisherige Daten).

### Behoben (Vorfall, 2026-06-12)
- **Domain-Hijack durch fehlende `routes`-Isolation:** Die `env.dev`-Konfiguration erbte die Top-Level-`routes` und bog beim `wrangler deploy --env dev` die Custom Domain `malzimail.at` auf die (leere) Test-Instanz um. Erkannt über Verhaltens-Check (Setup-Assistent statt Login, `invalid_token` für Trainer „malziland"). Behoben: `"routes": []` in `env.dev`, Produktions-Worker neu deployt (Domain zurückgeholt), Migration 0006 additiv auf Prod angewendet. **Produktionsdaten waren nie betroffen** (eigene D1). Lehre: env-spezifische Deploys immer mit isolierten `routes` + zuerst Verhaltens-Check der Domain.

### Hinzugefügt (Phase 1 — Settings & Passwort-Setup, 2026-06-11)
- `settings`-Tabelle (Migration 0006, additiv) als Schlüssel-Wert-Speicher.
- `src/domain/settings.js`: Vorrang-Kette DB → Secret/Env → Default (`resolveConfig`) + Feature-Flag-Helfer (`isFlagEnabled`/`setFlag`).
- `src/lib/passwords.js`: PBKDF2-SHA256-Passwort-Hashing mit Zufalls-Salt + konstanter Zeitvergleich; Session-Token-Helfer.
- Setup-Assistent Schritt 1: erster Aufruf von `/admin` ohne konfiguriertes Passwort zeigt „Passwort festlegen" (Hash landet in der DB). Mit vorhandenem Passwort (`COCKPIT_PASSWORD` oder DB-Hash) → unverändert normaler Login.
- „Passwort ändern" im Admin (`/admin/password`).
- Tests: 15 neue (passwords, settings-Vorrangkette inkl. D1-Integrationstest) — gesamt 32 grün.
- `docs/konfiguration.md` (alle Einstellungen + Vorrang-Kette).
- Auf `malzimail-dev` erprobt: Setup-Assistent erscheint nur ohne Passwort; Legacy-Login unverändert; DB-Passwort-Login + Falsch-Ablehnung ok.

### Hinzugefügt (Phase 0 — Fundament, 2026-06-11)
- Git-Repository initialisiert; `.gitignore` um Schlüsseldateien/Artefakte gehärtet.
- Test-Framework: Vitest + `@cloudflare/vitest-pool-workers` (Tests laufen in der echten Workers-Laufzeit); erste Unit-Tests für `src/crypto.js`, `src/google.js` (Konfig-Pfad) und den Login-Namensgenerator.
- Linting: ESLint (flat config) mit Workers-Globals.
- CI: GitHub-Actions-Workflow (Lint + Tests) — aktiv, sobald das Repo auf GitHub liegt.
- Standard-Dateien: README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, CHANGELOG, `.editorconfig`, `.nvmrc`.
- Ziel-Schichtordner (`src/routes|domain|db|lib|views`, `test/…`) als leere Struktur angelegt.
- Test-Instanz `malzimail-dev` (eigener Worker + eigene D1-Datenbank) für gefahrloses Erproben.
- `docs/architektur.md` (Ist-Architektur) begonnen.

### Zuvor (vor Phase 0, unversioniert — Auszug)
- 2026-06-11: Google-Integration live (automatische Wegwerf-Google-Konten via Cloud Identity Free + Admin SDK; friendly Logins, Passwort = Login, Teilnehmer-Karte mit Countdown, Cron-Löschung, Admin-Schalter pro Trainer). `ACTIVATION_HOURS=24`.
- 2026-05/06: Basisdienst auf malzimail.at — temporäre Adressen, Posteingang, Trainer-Token-System, Admin, Verschlüsselung (AES-GCM), Rechtsseiten, Security-Header, QR, Cron-Cleanup.

# RUNBOOK — Betrieb, Deploy, Rollback, Notfall

Betriebs-Handbuch für eine malziMAIL-Instanz. Zielgruppe: Betreiber:in (auch ohne
Programmier-Hintergrund) und KI-Assistenten. Für die Erst-Einrichtung siehe
[installation-anleitung.md](installation-anleitung.md).

## Instanzen (Referenz-Setup des Projekts)

| Instanz | Zweck | Besonderheit |
|---|---|---|
| Produktion (`malzimail`) | echter Betrieb auf der eigenen Domain | Custom Domain + Email Routing |
| Test (`malzimail-dev`) | jede Änderung wird hier zuerst erprobt | workers.dev-URL, eigene D1-Datenbank, eigene Secrets, **kein** Mail-Empfang |

Grundregel: **Nie direkt auf Produktion.** Reihenfolge immer: lokal testen → Test-Instanz → Produktion.

## Normaler Deploy

```bash
npm run check          # Lint + alle Tests müssen grün sein
npm run deploy:dev     # 1. auf die Test-Instanz
# … auf der Test-Instanz durchklicken (siehe docs/funktionstest.md) …
npm run deploy         # 2. erst dann Produktion
```

Migrationen (falls im Change enthalten) **vor** dem jeweiligen Deploy einspielen:

```bash
npm run db:migrate:dev      # Test-Instanz
npm run db:migrate:remote   # Produktion
```

### ⚠️ Bekannte Falle: `--env dev` und die Custom Domain (Vorfall 12.06.2026)

`env.dev` in der `wrangler.jsonc` MUSS `"routes": []` enthalten. Fehlt das,
erbt ein `wrangler deploy --env dev` die Top-Level-Routes und **biegt die
Produktions-Domain auf die Test-Instanz um**. Das ist genau so passiert.
Deshalb nach **jedem** env-Deploy die Nach-Deploy-Checks ausführen.

### Nach-Deploy-Checks (Pflicht, ~1 Minute)

```bash
# 1. Admin der Produktion antwortet mit „Anmelden“ (NICHT „Passwort festlegen“ / Assistent):
curl -s https://malzimail.at/admin | grep -o "Anmelden" | head -1

# 2. Startseite erreichbar (HTTP 200):
curl -s -o /dev/null -w "%{http_code}\n" https://malzimail.at/

# 3. Version notieren (steht im Deploy-Output: „Current Version ID: …“)
```

Nach Live-Deploys, die den Mail-Pfad berühren: eine Probemail an eine aktive
Wegwerf-Adresse schicken und den Eingang in der Teilnehmer-Ansicht prüfen.

## Rollback (Zurück auf einen früheren Stand)

### Weg 1 — Cloudflare-Versions-Rollback (schnellster Weg, kein Build nötig)

Cloudflare behält alte Worker-Versionen; ein Rollback aktiviert eine frühere Version wieder:

```bash
npx wrangler versions list            # Versions-IDs der letzten Stände anzeigen
npx wrangler rollback <version-id>    # genau diese Version wieder aktivieren
```

Wichtig: Das rollt nur den **Code** zurück, nicht die Datenbank. Nach einem
Rollback über eine Migrations-Grenze hinweg gilt: Migrationen sind additiv
(Expand-Contract, siehe unten), ältere Code-Stände laufen daher auf dem
neueren Schema weiter.

### Weg 2 — Alten Git-Stand neu deployen (wenn Weg 1 nicht reicht)

```bash
git worktree add /tmp/rollback vX.Y.Z     # gewünschten Release-Tag auschecken
cd /tmp/rollback && npm install
npm test                                   # Stand verifizieren
npx wrangler deploy --config /pfad/zur/lokalen/wrangler.jsonc
cd - && git worktree remove --force /tmp/rollback
```

### Rollback-Probe (durchgeführt am 14.07.2026)

Der Weg wurde tatsächlich durchgespielt, nicht nur beschrieben:
Tag `v1.0.1` (Commit `53feafb`) in einem frischen `git worktree` ausgecheckt,
`npm install` (198 Pakete), `npm run lint` grün, `npm test` grün
(**22 Dateien, 138 Tests**), Bundle-Bau per `wrangler deploy --dry-run`
erfolgreich. Ergebnis: Jeder getaggte Stand ist aus sich heraus baubar und
testbar. Nachweis: [VERIFICATION.md](VERIFICATION.md).

## Datenbank

- **Migrationen nur additiv** (Expand-Contract): erst neue Spalten/Tabellen
  hinzufügen; Löschendes erst, wenn kein aktiver Stand es mehr braucht.
  Jede Migration ist eine eigene nummerierte Datei unter `migrations/`.
- **Wiederherstellung:** D1 bietet eine eingebaute Punkt-in-Zeit-Wiederherstellung
  (Time Travel): `npx wrangler d1 time-travel info <datenbank>` bzw.
  `… restore <datenbank>`. Das Zeitfenster ist begrenzt — vor Nutzung die
  aktuelle Cloudflare-Doku prüfen. Zusätzlich gilt: Mail-Inhalte sind
  bewusst kurzlebig (Standard 48 h) — ein Datenverlust betrifft daher im
  schlimmsten Fall Wegwerf-Daten eines laufenden Workshops.
- **Restore niemals ohne ausdrückliche Betreiber-Freigabe** ausführen
  (destruktiv: überschreibt den aktuellen Datenbankstand).

## Notfälle (Incidents)

| Symptom | Ursache/Behebung |
|---|---|
| Produktions-Domain zeigt Einrichtungs-Assistent oder Test-Daten | Routes-Vorfall (siehe Falle oben): sofort `npm run deploy` (Produktion) ausführen, danach Nach-Deploy-Checks |
| `wrangler` meldet „Fehler 10000“ / Authentication error | Cloudflare-Login abgelaufen: Betreiber:in muss einmal `npx wrangler login` ausführen |
| Mails kommen nicht an | MX-Einträge der Domain prüfen (Cloudflare Email Routing). **Die MX-Einträge NIEMALS auf Google umstellen** — das kappt den Mail-Empfang dauerhaft. DNS wird ausschließlich bei Cloudflare gepflegt |
| Google-Konten können nicht angelegt werden | Im Admin „Verbindung testen“ (Google-Konfiguration); Tenant-Limit prüfen (Cloud-Identity-Konto-Limit); Cron löscht abgelaufene Konten automatisch alle 6 h |
| Not-Aus während eines Workshops | Im Admin „Workshop stoppen“: macht den Teilnehmer-Link tot und **wischt alle** Postfächer und Google-Konten |
| Verdacht auf geleaktes Secret | Secret zuerst **rotieren/sperren** (Cloudflare-Dashboard bzw. Google-Konsole), erst danach ggf. Historie bereinigen. Rotation geht vor Aufräumen |

## Secrets (nur Namen — Werte niemals dokumentieren)

Per `npx wrangler secret put <NAME>` gesetzt; Übersicht: `npx wrangler secret list`.

| Secret | Zweck |
|---|---|
| `COCKPIT_PASSWORD` | Admin-Passwort-Fallback (Vorrang hat der Hash in den Settings) |
| `MAIL_ENCRYPTION_KEY` | Master-Schlüssel für die Verschlüsselung (Mails + Google-Schlüssel) |
| `GOOGLE_SA_KEY` | Google-Service-Account-Schlüssel (Fallback; Vorrang hat die verschlüsselte DB-Ablage) |
| `ADMIN_KEY` (optional) | falls gesetzt: alternativer Admin-Zugang per `/admin?key=…`. **Zweites Voll-Zugangs-Credential** — bei Leak-Verdacht mit-rotieren. Wenn nicht genutzt: nicht setzen (Rest-Risiko, siehe [SECURITY-MODEL.md](SECURITY-MODEL.md)) |

## Wiederkehrende Wartung

- **Cron** `0 */6 * * *` (automatisch): löscht abgelaufene Mails und Google-Konten.
- **Dependabot** (automatisch): hält Abhängigkeiten aktuell; Updates laufen als PR durch die CI.
- Nach größeren Änderungen: KURZAUDIT; vor jedem Release: LANGAUDIT (siehe Projekt-Charta).

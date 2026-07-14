# SECURITY-MODEL — Sicherheits- und Datenskizze

Referenz für Entwicklung und Audits. Skizze, kein vollständiges Threat Model
und keine Rechtsberatung; die Tiefenprüfung übernimmt das Audit vor jedem
Release (siehe [oss-projekt-charta.md](oss-projekt-charta.md)).
Technische Details: [architektur.md](architektur.md), Audit-Baseline:
[security-audit-2026-06-14.md](security-audit-2026-06-14.md) (Hinweis: dort
beschriebene Punkte zu `srcdoc`/`unsafe-inline` sind überholt — seit 14.06.2026
gilt eine CSP ohne `unsafe-inline`, Mail-Anzeige über eine eigene iframe-Route).

## Schützenswerte Werte (Assets)

| Asset | Warum schützenswert |
|---|---|
| Mail-Inhalte in D1 | können PII und Zugangsdaten enthalten (absenderbestimmt) |
| `MAIL_ENCRYPTION_KEY` | Master-Schlüssel; entschlüsselt Mails + Google-Schlüssel |
| Google-Service-Account-Schlüssel | erlaubt Konto-Anlage/-Löschung im Google-Tenant |
| Admin-Zugang (Passwort-Hash, Session-Cookie; optional `ADMIN_KEY`) | volle Kontrolle über die Instanz. `ADMIN_KEY` = optionaler URL-Schlüssel-Zugang (`/admin?key=…`); wenn gesetzt, ein zweites Voll-Zugangs-Credential — siehe Rest-Risiken |
| Teilnehmer-Link (Workshop-Token) | einziges Tor zur Adress-/Konto-Anlage |
| Wegwerf-Google-Konten (Login = Passwort) | bewusst schwach — nur so lange gültig wie die Adresse |

## Rollen und Vertrauensgrenzen

| Rolle | Vertrauen |
|---|---|
| Mail-Absender (Internet) | **nicht vertrauenswürdig** — Inhalte sind Angriffsfläche (XSS) |
| Anonymer Besucher | nicht vertrauenswürdig; sieht nur Startseite + Rechtsseiten |
| Teilnehmer:in (mit Workshop-Link) | begrenzt vertraut: darf Adressen anlegen und Postfächer **des eigenen Workshops** lesen. Der Lesezugriff ist an den geteilten Workshop-Token gebunden, **nicht** an die einzelne Person — Teilnehmende desselben Workshops sind untereinander nicht getrennt (siehe Rest-Risiko „Intra-Workshop-Einsicht“) |
| Betreiber:in / Admin (Passwort) | voll vertraut; kann per Design alles entschlüsseln (kein Zero-Knowledge möglich, da der Worker Google ansprechen muss) |
| Cloudflare (Hosting, DNS, Mail-Routing, D1) | Infrastruktur-Anbieter / Auftragsverarbeiter |
| Google (Cloud Identity, Admin SDK) | externer Dienst; API-Antworten gelten als nicht vertrauenswürdige Eingabe |

## Datenflüsse

1. **Mail-Eingang:** Internet → Cloudflare Email Routing (Catch-All) → Worker `email()` → Prüfung (Adresse aktiv?) → Parsen → **AES-256-GCM-verschlüsselt** in D1.
2. **Teilnehmer:** Browser → Worker `fetch()` → D1 (Lesen nur mit passendem Workshop-Token; Mail-HTML isoliert über `/api/message/:id/frame` mit eigener, strenger CSP).
3. **Google-Provisionierung:** Worker → Google Admin SDK (JWT via Web Crypto); Konto-Anlage/-Löschung im eigenen Tenant.
4. **Keine weiteren Dritten:** kein Analytics, kein externes Fehler-Tracking, keine externen Fonts/CDNs (CSP `'self'`).

## Wesentliche Missbrauchsfälle und Gegenmaßnahmen

| Missbrauchsfall | Gegenmaßnahme |
|---|---|
| Bösartige Mail schleust Skript ein (XSS) | Mail-HTML nur im iframe mit eigener CSP (`default-src 'none'`, Skripte blockiert, `sandbox`); Metadaten via `textContent`/`escape()` |
| SQL-Injection | ausschließlich gebundene Parameter (`.bind()`), einzige SQL-Stelle `src/db/queries.js` |
| Admin-Passwort raten | PBKDF2-HMAC-SHA256 (**100.000 Iterationen** — Cloudflare-Edge-Kappe; höhere Werte werfen live, `src/lib/passwords.js`), Login-Drosselung pro IP (nur Passwort-POST), konstante-Zeit-Vergleich |
| CSRF auf Admin-Aktionen | Cookie `HttpOnly; Secure; **SameSite=Lax**` (seit v1.0.1, für Mobile-Login; Cross-Site-POSTs senden das Cookie trotzdem nicht) + Origin/Referer-Prüfung auf allen Admin-POSTs |
| DB-Leak | Mail-Inhalte + Google-Schlüssel at rest AES-256-GCM (HKDF-Domänentrennung); Master-Secret nur als Worker-Secret |
| Geleakter Teilnehmer-Link | rotierender, schwer erratbarer Link je „Start“; „Stopp“ macht ihn sofort tot und wischt alles; Konto-Anlage endet am Google-Limit. Bewusster Trade-off: kein Rate-Limit auf `/api/address` (dokumentiertes Rest-Risiko) |
| Secret im Repo | gitleaks in CI (volle Historie); Beispiel-Konfig nur mit Platzhaltern; Vorgehen bei Leak: rotieren vor bereinigen ([RUNBOOK.md](RUNBOOK.md)) |
| PII in Logs | Adressen werden vor dem Loggen gehasht; keine Klartext-PII in Logs |

## Aufbewahrung und Löschung (Privacy-Notiz)

- **Zweck/Minimierung:** Wegwerf-Postfächer für Workshops; es werden keine
  Bestandskonten, Profile oder Tracking-Daten geführt.
- **Fristen:** Mail-Inhalte und Google-Konten leben maximal `ttlHours`
  (Standard **48 h**); Cron räumt alle 6 h auf. „Workshop stoppen“ löscht
  aktive Postfächer sofort; bereits abgelaufene Reste sowie im Fehlerfall
  verbliebene Google-Konten holt spätestens der nächste Cron-Lauf (≤ 6 h)
  nach. Adress-Einträge bleiben (ohne Inhalte) für globale Eindeutigkeit
  erhalten.
- **Empfänger/Auftragsverarbeitung:** Cloudflare (Hosting/Mail/DB), Google
  (nur Wegwerf-Konten). Rechtstexte der Instanz werden aus den
  Betreiber-Settings erzeugt; die rechtliche Gesamtbewertung liegt bei der
  Betreiber:in (Phase 5 der Charta).

## Sicherheitsausnahmen (dokumentierte Rest-Risiken)

| Ausnahme | Begründung | Owner | Überprüfung |
|---|---|---|---|
| Kein Rate-Limit auf `/api/address` | Tor ist der rotierende geheime Link; Limits wurden bewusst entfernt (Betreiber-Verantwortung) | Betreiber:in | beim nächsten LANGAUDIT |
| Betreiber kann entschlüsseln | systembedingt (Worker muss Google ansprechen); schützt trotzdem gegen DB-Leaks | Betreiber:in | dauerhaft akzeptiert |

## Offene Befunde (Audit 14.07.2026 — Fix geplant über dev-getestete Änderung)

Diese Punkte sind **noch nicht behoben**. Sie ändern Laufzeitverhalten und dürfen
laut Arbeitsregel 1 nur nach Test auf der dev-Instanz live gehen; deshalb bewusst
getrennt vom Doku-/CI-Patch v1.1.1 gehalten.

| Befund | Wirkung | geplante Behebung |
|---|---|---|
| **Intra-Workshop-Einsicht (SEC-P2):** Lesezugriff hängt am geteilten Workshop-Token; Adressen im Google-Modus sind kurze `Wort+4 Ziffern`-Logins, `/api/address/status` bestätigt Existenz tokenlos → ein Teilnehmer kann fremde Postfächer desselben Workshops erraten/aufzählen und mitlesen | Teilnehmende eines Workshops sind untereinander nicht getrennt; Wegwerf-Daten, Angreifer braucht den Workshop-Link | Postfach-Lesen an ein pro-Adresse-Geheimnis binden (statt nur am Workshop-Token); `/api/address/status` absichern; Aufzählbarkeit reduzieren. **Design-Entscheidung offen** (Cross-Device-QR-Login darf nicht brechen) |
| **Login-IPs dauerhaft (PRIV-P2):** `loginguard:<ip>` wird je Fehlversuch in `settings` geschrieben und nie gelöscht — Widerspruch zur Datenschutzseite („keine IP dauerhaft“) + unbegrenztes Wachstum | personenbezogene IPs unbefristet gespeichert; DB-Aufblähung durch Bots | abgelaufene `loginguard:*`-Zeilen im Cron aufräumen bzw. In-Memory-Drossel |
| **„Stopp“ scheitert bei Google-Ausfall (OPS-P2):** `wipeAllSessions` ruft Google **vor** den lokalen Löschungen; Token-Abruf ohne try/catch → bei Google-/Netz-Ausfall wird lokal nichts gelöscht, Fehler wird verschluckt | Not-Aus kann stillschweigend fehlschlagen, Link bleibt aktiv | lokale Löschung **zuerst**, Google-Teil kapseln; Fehler im Modal anzeigen |
| **Google-Konto-Leiche (PRIV-P3):** Kompensations-Löschung prüft den `false`-Rückgabewert von `deleteGoogleUser` nicht | seltener (Doppelfehler) verwaister Google-Account = nicht gelöschte Daten + Sitzplatz-Verlust | Rückgabewert prüfen + loggen |
| **48-h-Hard-Cap vs. `ttlHours` (STATE-P3):** `MESSAGE_RETENTION_MS` ist fix 48 h; bei `address_ttl_hours` > 48 verschwinden Mails aus noch aktiven Postfächern | stiller Mail-Verlust nur bei Nicht-Default-Konfiguration | Retention an `ttlHours` koppeln |
| **`ADMIN_KEY`-Pfad ungedrosselt (SEC-P3):** `/admin?key=…` umgeht die Login-Drossel, Vergleich nicht konstante-Zeit; nur aktiv, wenn das (bisher undokumentierte) Secret gesetzt ist | falls gesetzt: erratbarer Voll-Admin-Zugang ohne Sperre | Drossel + konstante-Zeit-Vergleich, oder Pfad entfernen; jetzt zumindest dokumentiert |
| **Doppelklick „Start“ (STATE-P3):** `deactivate`+`insert` ohne Transaktion → theoretisch zwei aktive Links | zweiter, unsichtbarer Mint-Link bis zum nächsten Start/Stopp; selbstheilend | Start-Button entprellen / beide Schritte atomar |

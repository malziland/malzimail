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
| Admin-Zugang (Passwort-Hash, Session-Cookie) | volle Kontrolle über die Instanz. Einziger Login-Weg ist das Admin-Passwort (PBKDF2); der frühere optionale `ADMIN_KEY`-URL-Zugang wurde entfernt |
| Teilnehmer-Link (Workshop-Token) | einziges Tor zur Adress-/Konto-Anlage |
| Wegwerf-Google-Konten (Login = Passwort) | bewusst schwach — nur so lange gültig wie die Adresse |

## Rollen und Vertrauensgrenzen

| Rolle | Vertrauen |
|---|---|
| Mail-Absender (Internet) | **nicht vertrauenswürdig** — Inhalte sind Angriffsfläche (XSS) |
| Anonymer Besucher | nicht vertrauenswürdig; sieht nur Startseite + Rechtsseiten |
| Teilnehmer:in (mit Workshop-Link) | begrenzt vertraut: Teilnehmende eines Workshops bilden eine semi-vertraute Gruppe (gemeinsamer Link). Die Isolation **zwischen** Teilnehmenden desselben Workshops wird intern nachgeschärft |
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
| Teilnehmende eines Workshops sind untereinander nicht kryptografisch getrennt | semi-vertraute, eingeladene Gruppe; nur Wegwerf-Inhalte, kurzlebig, Seite nur während des Workshops offen; strengere Trennung würde den Cross-Device-QR-Login verkomplizieren | Betreiber:in | akzeptiert (Christoph, 14.07.2026) |

## Offene Befunde

Die internen Sicherheits-/Zuverlässigkeitsbefunde des Audits vom 14.07.2026
wurden behoben (dev-getestete Änderungen). Der einzige verbliebene Punkt ist
oben als bewusst akzeptiertes Rest-Risiko festgehalten. Detail-Notizen liegen
intern (`docs/security-private/`, gitignoriert) — hier bewusst ohne
Ausnutzungs-Details für einen laufenden Dienst. Schwachstellen bitte vertraulich
melden, siehe [SECURITY.md](../SECURITY.md).

# Sicherheits-Selbst-Audit — 2026-06-14 (Phase 5e)

> **⚠️ ÜBERHOLT (Stand 14.07.2026).** Historisches Dokument, nicht mehr der Ist-Stand.
> Vier Aussagen hier stimmen nicht mehr mit dem Code überein:
> (1) Mail-Anzeige nutzt **kein** `<iframe srcdoc>` mehr, sondern eine eigene
> iframe-Route mit eigener CSP; (2) die CSP hat **kein** `script-src 'unsafe-inline'`
> mehr (nur ein Theme-Init-Snippet per SHA-256-Hash); (3) das Admin-Cookie ist seit
> v1.0.1 `SameSite=Lax`, nicht `Strict`; (4) die PBKDF2-Iterationen sind **100.000**
> (Cloudflare-Edge-Kappe), **nicht** 600.000 — der Umstieg auf 600k warf live einen
> Fehler und wurde zurückgenommen. Aktueller Stand: [SECURITY-MODEL.md](SECURITY-MODEL.md).

Selbstprüfung des Codes (Schwerpunkt: Umbau auf rotierende Links + Krypto-Härtung). **Ersetzt nicht** den formalen Audit von Christoph, dient ihm als Baseline.

## Geprüft & in Ordnung

| Bereich | Befund |
|---|---|
| **SQL-Injection** | Alle D1-Queries nutzen ausschließlich gebundene Parameter (`?`/`.bind()`). Keine String-Interpolation in SQL. |
| **XSS — Mail-Inhalt (Absender-kontrolliert!)** | HTML-Mails rendern in einem `<iframe srcdoc>` mit `sandbox="allow-popups allow-popups-to-escape-sandbox"` — **kein** `allow-scripts`, **kein** `allow-same-origin` → Skripte im Mail-HTML laufen nicht und haben keinen Origin-Zugriff. Betreff/Absender/Text via `textContent`. |
| **XSS — sonst** | Server-Templates escapen via `escape()` (`& < > " '`); reflektierte `?flash=`-Werte werden escaped. |
| **Admin-Passwort** | PBKDF2-HMAC-SHA256, 16-Byte-Zufallssalt, konstante-Zeit-Vergleich, selbstbeschreibendes Format (`pbkdf2:iter:salt:hash`). Session-Cookie aus eigenem Secret, nicht aus dem Passwort. |
| **CSRF** | Auth-Cookie `HttpOnly; Secure; SameSite=Strict`; zusätzlich Origin/Referer-Check auf allen Admin-POSTs. |
| **Verschlüsselung at rest** | AES-256-GCM; Schlüssel via HKDF-SHA256 mit Domänen-Trennung (`mail`/`google`); Master-Secret nur als Worker-Secret, nie im Repo; SA-Schlüssel nie zurückgezeigt. |
| **Security-Header** | CSP (`default-src 'self'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`), HSTS, X-Content-Type-Options etc. |
| **Logging** | Keine PII im Klartext — Adressen werden vor dem Loggen gehasht (`hashForLog`). |
| **Cookie** | `HttpOnly; Secure; SameSite=Strict`. |

## Behoben in diesem Audit
- **PBKDF2-Iterationen 100k → 600k** (OWASP-2023-Empfehlung). Format ist selbstbeschreibend → bestehende 100k-Hashes verifizieren unverändert weiter.

## Rest-Risiken / bewusste Trade-offs (für Phase 6 / formalen Audit)
1. **CSP `script-src 'unsafe-inline'`** — nötig für die Inline-Skripte (Stopp-Spinner, Live-Zähler). Da keine XSS-Einschleusstelle existiert (alles `textContent`/`escape()`), ist das Restrisiko gering. Härtung: auf CSP-Nonces umstellen (größerer Umbau).
2. **Kein Rate-Limit auf `/api/address`** — die Tageslimits wurden bewusst entfernt. Der Teilnehmer-Link ist das einzige Tor; ein geleakter/erratener Link erlaubt Adress-/Konto-Anlage bis zum Google-50-Limit. Abgesichert durch den schwer erratbaren Link (Variante B: Tier + 4 Ziffern + 3 Zufallszeichen). Optional später: einfaches Rate-Limit pro IP/Link.
3. **Operator-entschlüsselbar by design** — der Worker muss die Schlüssel entschlüsseln können, um Google anzusprechen; das ist systembedingt (kein Zero-Knowledge möglich). Schützt zuverlässig gegen DB-Leaks.

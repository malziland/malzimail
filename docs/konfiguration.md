# Konfiguration

malzimail liest jede Einstellung über eine feste **Vorrang-Kette**:

```
1. settings-Tabelle (Datenbank)   ← per Admin/Setup-Assistent gesetzt
2. Environment-Variable / Secret  ← klassischer Weg (wrangler)
3. eingebauter Standardwert
```

**Wichtig:** Eine leere `settings`-Tabelle bedeutet **exakt das heutige Verhalten** — die App fällt dann auf Secrets/Variablen zurück. Bestehende Instanzen ändern sich durch ein Update also nicht.

## Admin-Passwort

| Quelle | Schlüssel | Hinweis |
|---|---|---|
| Datenbank | `settings.admin_password_hash` | PBKDF2-SHA256-Hash (100 000 Iterationen — die Cloudflare-Workers-Obergrenze); vom Setup-Assistenten oder „Passwort ändern" gesetzt |
| Secret | `COCKPIT_PASSWORD` | Klartext-Passwort (Altweg); gilt, solange kein DB-Hash existiert |

- **Erster Aufruf von `/admin` ohne jedes Passwort** → Setup-Assistent (Passwort festlegen). Danach normaler Login.
- **„Passwort ändern"** (Link im Admin) schreibt den DB-Hash; ab dann hat der DB-Hash Vorrang vor dem Secret.
- Das Session-Cookie (`mzm_admin`) trägt ein stabiles, vom aktiven Passwort abgeleitetes Geheimnis — bestehende Live-Sessions bleiben nach dem Update gültig.

## Variablen (wrangler.jsonc `vars`)

| Variable | Bedeutung | Standard |
|---|---|---|
| `MAIL_DOMAIN` | Domain der Wegwerf-Adressen | `deine-domain.at` (in `wrangler.jsonc` gesetzt) |
| `ADDRESS_TTL_HOURS` | Max. Lebensdauer einer Adresse/eines Logins in Stunden (unsichtbar, kein Countdown — erlaubt Aktivierung am Vortag) | `48` |
| `GOOGLE_ADMIN_SUBJECT` | Super-Admin für die Google-Konten (Altweg; im Setup-Assistenten Schritt 3 verpflichtend, alternativ im Admin unter „Google-Konfiguration") | – |
| `GOOGLE_ACCOUNT_DOMAIN` | Domain der Google-Logins (Altweg; im Setup-Assistenten Schritt 3 verpflichtend, alternativ im Admin unter „Google-Konfiguration") | – |

Der **Teilnehmer-Link** wird beim Klick auf **„Workshop starten"** automatisch als rotierender Tier-Token erzeugt (z. B. `marder9530-5wq`) und im Setting `default_workshop_token` gehalten — **keine Konfiguration nötig**. Die Dauer lässt sich auch zur Laufzeit über das Setting `address_ttl_hours` ändern (Vorrang vor der Variable). *(Hinweis: `GOOGLE_ADMIN_SUBJECT`/`GOOGLE_ACCOUNT_DOMAIN` können auch im Admin unter „Google-Konfiguration" gesetzt werden.)*

## Secrets (`wrangler secret put …`)

| Secret | Bedeutung |
|---|---|
| `MAIL_ENCRYPTION_KEY` | Schlüssel für die Mail-/Secret-Verschlüsselung (AES-GCM). Bleibt ein Secret (kann nicht in die DB, da er sie ja schützt). |
| `COCKPIT_PASSWORD` | Admin-Passwort (Altweg, s. o.) |
| `GOOGLE_SA_KEY` | Service-Account-JSON für die Google-Integration (Altweg). Üblicherweise wird der Schlüssel im Setup-Assistenten (Schritt 3) hinterlegt und landet AES-GCM-verschlüsselt in der DB; das Secret gilt nur, solange kein DB-Wert existiert. Google ist Pflichtbestandteil — ohne gültige Google-Konfiguration lässt sich die Installation nicht abschließen. |

## Feature-Flags

Schalter liegen ebenfalls in der `settings`-Tabelle als `flag_<name>` mit Wert `1`/`0` (Helfer: `isFlagEnabled` / `setFlag` in `src/domain/settings.js`). Grundlage für künftige optionale Funktionen, die pro Instanz an-/ausgeschaltet werden.

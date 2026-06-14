# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/); Versionierung nach [SemVer](https://semver.org/lang/de/).

## [1.0.1] – 2026-06-14

### Behoben
- **Eingeloggt bleiben auf dem Smartphone:** Das Admin-Session-Cookie ist jetzt `SameSite=Lax` (vorher `Strict`). Beim Schließen und erneuten Öffnen des Browsers (vor allem iOS Safari) bleibt man nun angemeldet. Der CSRF-Schutz bleibt erhalten — Cross-Site-POSTs werden weiterhin blockiert (Cookie wird dort nicht mitgesendet) und die Origin-Prüfung greift zusätzlich.
- **Mobile-Ansicht:** Der Kopier-Button rutscht nicht mehr unter das Adress-/Passwort-Feld, sondern bleibt daneben.

### Geändert
- Repo aufgeräumt (toter Code und ungenutztes CSS entfernt); Dokumentation auf den veröffentlichten Stand aktualisiert.

## [1.0.0] – 2026-06-14

Erste öffentliche Version von malziMAIL — ein selbst-hostbarer Wegwerf-Identitäts-Dienst für Workshops und Schulungen, komplett auf Cloudflare (Workers + D1 + Email Routing + Cloud Identity Free). Jede teilnehmende Person erhält eine temporäre E-Mail-Adresse, die zugleich ein Wegwerf-Google-Login (Gemini, NotebookLM, „Mit Google anmelden“) ist; Postfach und Login verschwinden nach dem Workshop automatisch wieder.

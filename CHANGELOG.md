# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.
Format angelehnt an [Keep a Changelog](https://keepachangelog.com/de/1.1.0/); Versionierung nach [SemVer](https://semver.org/lang/de/).

## [1.1.0] – 2026-07-13

### Geändert
- **Komplett neues Erscheinungsbild (malziland-Corporate-Design):** alle Seiten (Startseite, Teilnehmerseite, Admin, Setup-Assistent, Rechtsseiten) auf die malziland-Farbwelt umgestellt — Hell (Warmweiß-„Papier“-Look) als Standard, Dunkel-Theme nach CI-Leitfaden Kap. 11. Struktur, Texte und Abläufe sind unverändert (reiner Design-Wechsel).
- **Hell/Dunkel-Umschalter** (Mond/Sonne) auf jeder Seite; die Wahl wird im Browser gemerkt (`localStorage`-Schlüssel `ml_theme`). Kein Farbblitz beim Laden: ein winziges Theme-Snippet im Seitenkopf ist per SHA-256-Hash in der CSP freigegeben — weiterhin **kein `unsafe-inline`**; ein Wächter-Test hält Snippet und Hash synchron.
- **Statusfarben:** Positives („Workshop läuft“, „ok“, „verbunden“) in Teal; Gelb = gestoppt, Rot = Fehler (im Dunkel-Theme in den gewohnten kräftigen Tönen). „Workshop stoppen“ + Bestätigungs-Modal tragen als Signal jetzt Rost.
- **Schrift:** selbst gehostetes Poppins (SIL Open Font License, Lizenztext liegt im Font-Ordner) statt Systemschrift-Mix.
- **Footer einzeilig** und auf jeder Instanz mit festem Urheber-Credit „powered by malziland“ (die frühere instanzabhängige Umschreibung in `finalize()` ist entfernt; Tests entsprechend angepasst).
- Dekorative Glyphen (★ ▶ ⏹ ⏸ ⚠️ ⬆) durch schlichte Stroke-Icons ersetzt; Texte unverändert.

### Hinzugefügt
- **Markenflächen:** Favicon + App-Icons (malziland-m-Medaillon), `theme-color`, m-Wasserzeichen auf ruhigen Flächen.
- `TRADEMARKS.md` (zweisprachige Marken-Ausnahme zur MIT-Lizenz) + eigene Lizenz-Datei im Marken-Ordner `public/img/brand/`.
- Neue Stylesheet-Architektur: zentrale Design-Token in `public/tokens.css` (Hell + Dunkel), eingebunden von `landing.css`/`app.css`/`shell.css`; Doku in `docs/design-ci.md`.

### Unverändert (bewusste Ausnahmen)
- QR-Code bleibt schwarz auf weiß (Lesbarkeit), Mail-Inhalte werden weiterhin auf weißem Grund gezeigt (Mails sind für Weiß gestaltet), die Mail-iframe-Sonder-CSP bleibt unangetastet.

## [1.0.1] – 2026-06-14

### Behoben
- **Eingeloggt bleiben auf dem Smartphone:** Das Admin-Session-Cookie ist jetzt `SameSite=Lax` (vorher `Strict`). Beim Schließen und erneuten Öffnen des Browsers (vor allem iOS Safari) bleibt man nun angemeldet. Der CSRF-Schutz bleibt erhalten — Cross-Site-POSTs werden weiterhin blockiert (Cookie wird dort nicht mitgesendet) und die Origin-Prüfung greift zusätzlich.
- **Mobile-Ansicht:** Der Kopier-Button rutscht nicht mehr unter das Adress-/Passwort-Feld, sondern bleibt daneben.

### Geändert
- Repo aufgeräumt (toter Code und ungenutztes CSS entfernt); Dokumentation auf den veröffentlichten Stand aktualisiert.

## [1.0.0] – 2026-06-14

Erste öffentliche Version von malziMAIL — ein selbst-hostbarer Wegwerf-Identitäts-Dienst für Workshops und Schulungen, komplett auf Cloudflare (Workers + D1 + Email Routing + Cloud Identity Free). Jede teilnehmende Person erhält eine temporäre E-Mail-Adresse, die zugleich ein Wegwerf-Google-Login (Gemini, NotebookLM, „Mit Google anmelden“) ist; Postfach und Login verschwinden nach dem Workshop automatisch wieder.

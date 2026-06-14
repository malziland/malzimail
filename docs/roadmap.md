# malzimail — Roadmap & Ideen-Speicher

Hier werden Zukunftsideen geparkt, damit die Architektur sie nicht verbaut. **Nicht jetzt bauen** — nur sichtbar halten. Bewertung: Aufwand (S/M/L), Nutzen (1–3).

## Nach v1.0 denkbar

### ⭐ Laufzeit-Slider für den Workshop (Christoph, 11.06.2026 — Code wird darauf vorbereitet)

Beim Freischalten eines Kurses bestimmt der Betreiber per **Slider**, wie lange er gültig ist: **6 Stunden → schrittweise → dauerhaft.**
- **Nachträglich änderbar:** Verkürzen wie Verlängern jederzeit möglich.
- **Konsequente Wirkung:** Die gewählte Dauer steuert auch das Aufräumen — wird verkürzt, werden Adressen/Google-Konten entsprechend früher gelöscht.
- **Not-Aus:** Ein Knopf „jetzt beenden + aufräumen" löscht sofort, auch wenn eine lange/dauerhafte Laufzeit eingestellt war.
- **Code-Vorbereitung (läuft in Phasen 2–3 mit):** Zeitpunkte als Timestamps (bereits so), Dauer über Settings-Kette statt fest verdrahtet, Lösch-Logik zentral im Cron → der Slider wird später reine Oberflächen-Arbeit.
- Offene Design-Frage für später: Bei „dauerhaft" kollidiert die 48-h-Lebensdauer der Wegwerf-Identitäten (Postfach + Google-Login) mit dem Workshop-Fenster — Kopplung Adress-Lebensdauer ↔ Workshop-Dauer muss dann definiert werden (inkl. Google-50er-Limit im Blick).

| Idee | Beschreibung | Aufwand | Nutzen |
|---|---|---|---|
| Mehrere Google-Tenants | >50 Konten durch mehrere Cloud-Identity-Bereiche; App nimmt den mit freiem Platz | M | 2 |
| Limit-Erhöhung-Doku | Anleitung, wie man Googles 50er-Limit gratis erhöhen lässt (einfacher als Multi-Tenant) | S | 2 |
| Multi-Trainer als Flag | den ursprünglichen Trainer-Modus optional per Feature-Flag wieder aktivierbar | M | 1 |
| Theming / eigenes Branding | Farben, Logo pro Instanz über Einstellungen | M | 2 |
| Mehrsprachigkeit | App-Oberfläche umschaltbar (DE/EN) | L | 2 |
| Weitere KI-Dienste | „Login mit Google" gezielt für bestimmte Dienste dokumentieren/testen | S | 1 |
| Statistik-Export | CSV/JSON-Export der Workshop-Nutzung | S | 1 |
| Captcha/Bot-Schutz | Turnstile optional wieder rein (per Flag) | M | 1 |
| Webhook/Benachrichtigung | optionale Push-Nachricht bei eingehender Mail | M | 1 |
| Mehrere Admins | mehr als ein Admin-Login pro Instanz | M | 1 |

## Bewusst NICHT geplant (Scope-Grenzen)
- Eigener Mailversand (SPF/DKIM) — der Dienst empfängt nur, das bleibt so.
- Hosting-as-a-Service durch das Projekt selbst — jede:r hostet eigenständig.
- Bezahlfunktionen.

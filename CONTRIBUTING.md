# Mitmachen bei malzimail

Danke für dein Interesse! Bis zur Veröffentlichung (v1.0.0) ist das Projekt im Umbau — Beiträge sind ab dann willkommen. Diese Regeln gelten schon jetzt für alle Änderungen.

## Setup

```bash
git clone <repo>
cd malzimail
npm install
npm test          # muss grün sein
npm run lint      # muss sauber sein
```

Node-Version: siehe `.nvmrc`. Lokale Entwicklung: `npm run dev` (Wrangler).

## Regeln für Änderungen (Definition of Done)

1. **Tests:** Jede neue Funktion bringt Tests mit; bestehende Tests bleiben grün (`npm test`).
2. **Lint:** `npm run lint` ohne Fehler.
3. **Doku:** Betroffene Doku (README, docs/, CHANGELOG) im selben Zug aktualisieren.
4. **Kein Risiko für Betreiber:** Änderungen müssen rückwärtskompatibel sein (Fallback-Kette beachten, Migrationen nur additiv). Details: [docs/oss-umbau-konzept.md](docs/oss-umbau-konzept.md).
5. **Sprache:** Code & Kommentare Englisch, Nutzer-Oberfläche & Doku Deutsch.

## Architektur-Leitplanken

- Ziel-Schichten: `routes → domain → db/lib`, HTML in `views`. Siehe [docs/projektstruktur.md](docs/projektstruktur.md).
- Keine Geheimnisse in Code oder Repo — Secrets über Wrangler bzw. (künftig) verschlüsselte Settings.
- Qualitätsmaßstäbe: [docs/oss-projekt-charta.md](docs/oss-projekt-charta.md).

## Pull Requests

- Kleine, fokussierte PRs; aussagekräftige Beschreibung (Was/Warum/Wie getestet).
- CI muss grün sein.
- Sicherheitsrelevante Funde bitte NICHT als Issue/PR — siehe [SECURITY.md](SECURITY.md).

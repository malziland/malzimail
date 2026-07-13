# Design: malziland-Corporate-Design (seit v1.1.0)

Kurzreferenz für alle, die am Erscheinungsbild arbeiten. Verbindliche Quellen:
Claude-Design-Projekt „malziland Design System 2026" (Token + Leitfaden) und die
Referenz-Implementierung [malzime](https://github.com/malziland/malzime) (`public/styles.css`).

## Architektur

| Datei | Rolle |
|---|---|
| `public/tokens.css` | **Einzige Farbquelle:** Markenfarben, Hell-Token (`:root`) + Dunkel-Token (`:root[data-theme="dark"]`), Poppins-`@font-face`, Basis (Body, Fokus, reduced-motion), Wasserzeichen, Topbar/Wortmarke, Theme-Umschalter |
| `public/landing.css` / `app.css` / `shell.css` | Seiten-Stylesheets (importieren `/tokens.css`); Selektoren = unveränderte App-Klassennamen |
| `public/theme.js` | Mond/Sonne-Umschalter; speichert die Wahl in `localStorage["ml_theme"]` |
| Kopf-Snippet in jeder Seite | wendet gespeichertes Dunkel-Theme vor dem ersten Rendern an (kein Farbblitz) |

## Theme-Mechanik (WICHTIG bei Änderungen)

- Hell ist Standard; Dunkel = Attribut `data-theme="dark"` auf `<html>`.
- Das Kopf-Snippet ist der **einzige Inline-Script** der App und per SHA-256-Hash in der
  CSP freigegeben (kein `unsafe-inline`). Die Bytes müssen in `src/views/layout.js`
  (`THEME_INIT_SNIPPET`), `public/app.html` und `public/landing.html` **identisch** sein;
  der Hash steht in `src/lib/http.js` (`THEME_INIT_HASH`).
  **Snippet geändert ⇒ Hash neu berechnen** (`printf '%s' "<snippet>" | openssl dgst -sha256 -binary | base64`).
  Der Test `test/unit/finalize.test.js` („stay in sync") schlägt sonst fehl — Absicht.

## Farbregeln (Kurzfassung)

- Farben nur nach Rolle: **Teal** `#156480` = Stimme (Überschriften, Buttons, Links, positive
  Status wie „läuft/ok/verbunden") · **Rost** `#9c4e36` = Signal, sparsam („Workshop stoppen",
  Warn-Modal, Fehlerflächen-Akzent) · **Gold** `#bfb542` = nur Zahlen, nur im Dunkel-Theme ·
  Abstufungen NUR über Deckkraft, nie neue Farbtöne.
- Funktionale Signalfarben: Gelb = gestoppt/Warnung, Rot = Fehler (hell abgedunkelte Stufen,
  dunkel Originaltöne) — definiert als `--warn`/`--danger` in `tokens.css`.
- Haupt-Buttons: Teal-Verlauf `--ml-grad-teal`, Text weiß. Sekundär: 2-px-Teal-Outline.
- **Bewusste Ausnahmen:** QR-Code schwarz auf weiß (`src/routes/api.js`) · Mail-Detail-Inhalt
  weiß (Mails sind für Weiß gestaltet) · Mail-iframe-Route behält ihre eigene CSP (nicht anfassen,
  siehe Kommentar in `src/index.js`).

## Marken-Pflichten

- m-Wasserzeichen (`.brand-watermark`) 1× pro ruhiger Fläche, unten rechts, Theme-Weiche.
- Favicons/App-Icons = m-Medaillon; Markendateien unter `public/img/brand/` mit eigener
  `LICENSE.md`; Repo-weite Ausnahme in `TRADEMARKS.md`.
- Footer-Credit „powered by malziland" ist fix auf jeder Instanz (Inhaber-Festlegung 07/2026).
- Poppins bleibt selbst gehostet (OFL-Text im Font-Ordner); die Hausschrift Como darf NIE
  ins Repo oder selbst gehostet werden.

# Installation mit KI-Unterstützung (der einfachere Weg)

> **Für wen?** Für alle, die sich die Einrichtung allein nicht zutrauen. Du musst
> **kein Technik-Profi** sein. Ein KI-Assistent nimmt dich an die Hand: Er erklärt
> jeden Schritt in einfachen Worten, schreibt die Konfiguration für dich, führt die
> Terminal-Befehle aus und hilft, wenn etwas hakt. Die klassische Schritt-für-Schritt-
> Anleitung dafür ist [installation-anleitung.md](installation-anleitung.md) — die KI
> arbeitet genau diese Anleitung mit dir durch.

Diese Anleitung ist ein **fester Bestandteil** der Installation, kein Notbehelf.

---

## Welches KI-Werkzeug?

Du brauchst einen KI-Assistenten, der **Dateien lesen** und **Terminal-Befehle
ausführen** kann. Zwei gängige Wege:

| Werkzeug | Was es ist | Eignung hier |
|---|---|---|
| **Claude Code** (Anthropic) | Ein KI-Assistent, der **direkt auf deinem Computer** im Projektordner arbeitet: liest die Dateien, schreibt die Konfiguration, führt die Befehle aus. | **Am komfortabelsten** — er kann die Terminal-Schritte selbst erledigen, du bestätigst nur. |
| **ChatGPT (mit „Codex") / vergleichbare** | Ein Chat-Assistent; „Codex" kann auch Code/Repos bearbeiten. Ohne Codex erklärt er dir die Schritte, und du kopierst die Befehle selbst ins Terminal. | Geht auch — etwas mehr Eigenarbeit (Kopieren), wenn kein lokaler Zugriff. |

Beide Wege funktionieren. Wenn du die Befehle **nicht selbst** abtippen willst, ist
**Claude Code** der einfachste Weg, weil es lokal arbeitet.

---

## So gehst du vor (in 4 Schritten)

### Schritt 1 — Projekt auf deinen Computer holen
Projektseite: **https://github.com/malziland/malzimail**. Lade es herunter (grüner
Knopf „Code" → „Download ZIP", dann entpacken) **oder**, wenn du `git` hast:
```bash
git clone https://github.com/malziland/malzimail.git malzimail
cd malzimail
```

### Schritt 2 — Den KI-Assistenten auf den Projektordner ansetzen
- **Claude Code:** im Terminal in den Ordner wechseln (`cd malzimail`) und `claude`
  starten. Der Assistent sieht damit alle Projektdateien.
- **ChatGPT/Codex:** den Projektordner bzw. das Repo verbinden (Codex) oder die
  wichtigsten Dateien hochladen — mindestens `docs/installation-anleitung.md` und
  `wrangler.example.jsonc`.

### Schritt 3 — Der Start-Satz (zum Kopieren)
Füge diesen Text als erste Nachricht ein:

> „Ich möchte **malzimail** auf meiner eigenen Domain selbst installieren, habe aber
> wenig technische Erfahrung. Führe mich **Schritt für Schritt** durch
> `docs/installation-anleitung.md`. Erkläre jeden Schritt in einfachen Worten, frage
> mich nach den Werten, die du brauchst (meine Domain, mein Cloudflare-Account usw.),
> **schreibe die `wrangler.jsonc` für mich** und **führe die Terminal-Befehle aus**.
> Bei Schritten, die ich selbst im Cloudflare- oder Google-Dashboard anklicken muss,
> sag mir **genau, wo ich klicken muss**. Geh immer nur **einen** Schritt auf einmal
> und warte auf meine Rückmeldung."

### Schritt 4 — Schritt für Schritt mitgehen
Der Assistent führt dich durch Teil A–G. Du beantwortest seine Fragen und bestätigst
die Befehle. Am Ende läuft deine Instanz — der **System-Check** im Admin zeigt dir
grün/rot, ob alles passt (siehe [funktionstest.md](funktionstest.md)).

---

## Wobei die KI dir abnimmt — und wobei nicht

**Das macht die KI für dich:**
- Fragt deine Werte ab und **schreibt die `wrangler.jsonc`** (kein JSON-Gefummel).
- Legt die Datenbank an und wendet die Migrationen an.
- Bereitet die `wrangler secret put`-Befehle vor und **erklärt die Dashboard-Klicks**
  (Email Routing, Custom Domain, Google-Service-Account) — wo genau du hinmusst.
- Veröffentlicht die App (`wrangler deploy`).
- **Diagnostiziert Fehler:** Gib ihr die Fehlermeldung, sag ihr, was der System-Check
  oder `npx wrangler tail` anzeigt — sie sagt dir, woran es liegt.

**Das musst DU selbst tun (aus gutem Grund):**
- **Im Cloudflare-/Google-Dashboard klicken.** Die KI kann das nicht für dich — aber
  sie sagt dir Schritt für Schritt, wo. (Anleitung-Teile F und der Google-Teil.)
- **Geheimnisse eingeben.** Beim `wrangler secret put` und beim Google-Schlüssel
  tippst/fügst **du** die Werte ein.
  > ⚠ **Wichtig zur Sicherheit:** Kopiere **niemals** private Schlüssel, Passwörter oder
  > den Google-Service-Account-Schlüssel in ein Chat-Fenster — schon gar nicht in
  > web-basierte Tools. Solche Geheimnisse gehören nur ins Terminal (`wrangler secret put`)
  > bzw. ins Admin-Feld deiner eigenen Instanz. Ein KI-Assistent braucht sie nie.
- **Destruktive Schritte bestätigen.** Schau kurz, was ein Befehl tut, bevor du ihn
  bestätigst.

---

## Wenn etwas hakt
Sag es der KI konkret, zum Beispiel:
> „Beim Befehl X kommt diese Fehlermeldung: «…». Der System-Check im Admin zeigt bei
> «Verschlüsselung» ein rotes ✗. Was muss ich tun?"

Die KI kann die Fehlermeldung deuten, die häufigen Stolperstellen aus
[installation-anleitung.md](installation-anleitung.md) (Abschnitt „Wenn etwas hakt")
durchgehen und dir den nächsten Schritt nennen.

---

**Lieber klassisch ohne KI?** Kein Problem — die vollständige manuelle Anleitung steht
in [installation-anleitung.md](installation-anleitung.md). Die KI nutzt genau dieselbe.

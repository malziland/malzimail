# malzimail selbst installieren — Schritt für Schritt (für Einsteiger)

Diese Anleitung setzt **null Vorwissen** voraus. Arbeite **Teil A bis G der Reihe nach** ab. Bei jedem Schritt steht: **welche Adresse du öffnest**, **was du dort siehst** und **was du eintippst oder anklickst**.

> 🤖 **Der einfachere Weg — mit KI-Unterstützung:** Wenn du dir die Schritte allein
> nicht zutraust, kann ein KI-Assistent (z. B. **Claude Code** oder **ChatGPT/Codex**)
> dich durch diese ganze Anleitung führen, die Konfiguration für dich schreiben und die
> Befehle ausführen. Wie das geht, steht in **[installation-mit-ki.md](installation-mit-ki.md)**.

> 💡 **Wenn ein Menüpunkt bei dir anders heißt:** Anbieter benennen ihre Menüs laufend um. Die Reihenfolge stimmt trotzdem — nutze notfalls die Suchfunktion der jeweiligen Seite.

**Was am Ende läuft:** Dein eigener Wegwerf-Identitäts-Dienst auf deiner eigenen Domain — Teilnehmer öffnen einen Link und bekommen EINE Wegwerf-Identität: eine temporäre Adresse, die zugleich Postfach (Bestätigungsmails erscheinen direkt auf der Seite) UND Wegwerf-Google-Login (Gemini/NotebookLM) ist. Läuft komplett bei Cloudflare, kostet laufend nur die Domain.

---

# Teil A — Domain kaufen

**Was ist eine Domain?** Eine Internet-Adresse wie `meinedienst.at`. Auf ihr empfängt dein Dienst später die Wegwerf-Mails.

1. Wähle einen Registrar (Domain-Verkäufer). Bekannte Anbieter: IONOS, World4You, easyname, Namecheap — egal welcher, Hauptsache du kommst an die **Nameserver-Einstellung** (haben alle).
2. Such dort einen freien Namen und kauf ihn. Der **Preis steht beim Anbieter** — Vorsicht: Erstjahres-Schnäppchen vs. teurere Verlängerung, beides vor dem Kauf ansehen.
3. Du bekommst Zugangsdaten zur Domain-Verwaltung → **aufheben, brauchst du in Teil C.**

✅ **Ergebnis:** Du besitzt eine Domain.

---

# Teil B — Cloudflare-Account anlegen

**Was ist Cloudflare?** Der Dienst, bei dem deine App, deine Datenbank und der Mail-Empfang laufen. Die Gratis-Stufe reicht komplett.

1. Öffne: **`https://dash.cloudflare.com/sign-up`**
2. E-Mail-Adresse + Passwort festlegen → Konto erstellen.
3. Bestätigungs-Mail anklicken.

✅ **Ergebnis:** Du hast einen (leeren) Cloudflare-Account.

---

# Teil C — Domain zu Cloudflare bringen

Cloudflare muss deine Domain „verwalten" dürfen. Dazu stellst du beim Registrar die **Nameserver** um — das ist der wichtigste und fehleranfälligste Schritt der ganzen Installation. In Ruhe machen.

1. Im Cloudflare-Dashboard (**`https://dash.cloudflare.com`**): Knopf **„+ Domain hinzufügen"** (oder „Add a domain").
2. Deine Domain eintippen (z. B. `meinedienst.at`) → **Weiter**.
3. Tarif wählen: **Free** (0 €) → Weiter. (Cloudflare schlägt gern Bezahltarife vor — Free reicht.)
4. Cloudflare zeigt dir am Ende **zwei Nameserver-Adressen**, z. B. `anna.ns.cloudflare.com` und `bob.ns.cloudflare.com` → **beide kopieren/notieren.**
5. Jetzt zum **Registrar** (wo du die Domain gekauft hast): einloggen → deine Domain → Einstellung **„Nameserver"** (manchmal unter „DNS" oder „Domain-Einstellungen").
6. Die vorhandenen Nameserver **ersetzen** durch die zwei von Cloudflare → speichern.
7. Warten. Die Umstellung dauert **Minuten bis einige Stunden**. Cloudflare schickt dir eine Mail („Domain ist aktiv"), oder du siehst im Dashboard ein grünes Häkchen.

> ⚠ **Ab jetzt gilt:** Alle DNS-Einstellungen deiner Domain machst du **bei Cloudflare**, nicht mehr beim Registrar. Einträge beim Registrar sind ab jetzt wirkungslos (häufige Verwirrquelle!).

✅ **Ergebnis:** Cloudflare verwaltet deine Domain.

---

# Teil D — Werkzeuge auf deinem Computer

**Warum überhaupt?** Die App muss einmal von deinem Computer zu Cloudflare **hochgeladen** werden. Das Werkzeug dafür heißt **Wrangler** und läuft im **Terminal** (dem Befehls-Fenster deines Computers). Keine Angst: Du **kopierst nur fertige Befehle** und drückst Enter — programmieren musst du nichts.

### D1. Node.js installieren
1. Öffne: **`https://nodejs.org`**
2. Lade die **LTS-Version** (der links/grün markierte Knopf) herunter.
3. Installer öffnen → durchklicken (alle Voreinstellungen lassen).

### D2. Terminal öffnen
- **Mac:** ⌘+Leertaste → „Terminal" tippen → Enter.
- **Windows:** Startmenü → „PowerShell" tippen → Enter.

### D3. Prüfen, ob alles da ist
Tippe (oder kopiere) ins Terminal und drücke Enter:
```
node --version
```
→ Es muss eine Versionsnummer erscheinen (z. B. `v22.x.x`). Erscheint „command not found": Node.js-Installation wiederholen, Terminal neu öffnen.

### D4. Projekt herunterladen
1. Lade das malzimail-Projekt herunter — Projektseite **https://github.com/malziland/malzimail** → grüner Knopf **„Code" → „Download ZIP"** (oder mit `git`: `git clone https://github.com/malziland/malzimail.git`).
2. ZIP entpacken, z. B. in deinen Benutzerordner. Du hast jetzt einen Ordner wie `malzimail/`.
3. Im Terminal **in diesen Ordner wechseln**:
```
cd Pfad/zum/Ordner/malzimail
```
> 💡 Trick: `cd ` tippen (mit Leerzeichen), dann den Ordner **mit der Maus ins Terminal ziehen** — der Pfad wird automatisch eingefügt. Enter.

✅ **Ergebnis:** Dein Computer ist startklar.

---

# Teil E — Installation per Terminal (7 Befehle)

Alle Befehle der Reihe nach. Nach jedem: Enter drücken, Ausgabe lesen, dann den nächsten.

### E1. Bei Cloudflare anmelden
```
npx wrangler login
```
→ Browser öffnet sich → **„Allow / Zugriff erlauben"** klicken → Terminal meldet „Successfully logged in".

### E2. Konfigurations-Datei aus der Vorlage anlegen
Kopiere die mitgelieferte Vorlage zu deiner eigenen Konfig (die Vorlage enthält Platzhalter `<< … >>` und Kommentare):
```
cp wrangler.example.jsonc wrangler.jsonc
```
*(Die mitgelieferte `wrangler.jsonc` ist die Konfig der Betreiber-Instanz und wird hier überschrieben — das ist gewollt.)*

### E3. Datenbank anlegen
```
npx wrangler d1 create dein-d1-name
```
→ Die Ausgabe enthält eine **`database_id`** (lange Zeichenkette) → **kopieren.**

### E4. Werte in `wrangler.jsonc` eintragen
Öffne **`wrangler.jsonc`** und ersetze **alle** `<< … >>`-Platzhalter durch deine Werte:
- `"name"`: dein Worker-Name (z. B. `"mein-mailservice"`)
- `"database_name"` + `"database_id"`: Name und ID aus E3
- `"MAIL_DOMAIN"` und `"pattern"` (unter `routes`): deine Domain (z. B. `"meinedienst.at"`)
- die `GOOGLE_*`-Zeilen kannst du als Platzhalter lassen — die Google-Zugangsdaten trägst du **nicht hier**, sondern im **Einrichtungs-Assistenten (Schritt 3, siehe Teil G)** ein (verschlüsselt in der Datenbank gespeichert)
- den `env.dev`-Block kannst du anpassen (eigene Test-Instanz) oder löschen — `"routes": []` dort **muss leer bleiben**.

Speichern.

### E5. Datenbank-Tabellen anlegen
```
npx wrangler d1 migrations apply dein-d1-name --remote
```
→ Frage mit `y` bestätigen. Am Ende: grüne Häkchen.

### E6. Verschlüsselungs-Schlüssel setzen
Die Mails werden verschlüsselt gespeichert. Dafür brauchst du eine **lange Zufallszeichenkette** (dein Geheim-Schlüssel — notieren und sicher aufheben!).
```
npx wrangler secret put MAIL_ENCRYPTION_KEY
```
→ Es erscheint „Enter a secret value": Zufallszeichenkette eintippen/einfügen (mind. 32 Zeichen, z. B. aus einem Passwort-Generator) → Enter.

> **Admin-Passwort:** musst du **nicht** als Secret setzen. Beim ersten Aufruf von `/admin` führt dich ein **Einrichtungs-Assistent** durch das Festlegen des Passworts und deiner Betreiberdaten (für Impressum/Datenschutz) — siehe Teil G. *(Setze `COCKPIT_PASSWORD` nur, wenn du den Assistenten bewusst überspringen willst.)*

### E7. App veröffentlichen
```
npx wrangler deploy
```
→ Am Ende steht **„Deployed"** + eine Adresse. Deine App ist online! (Noch ohne Mail-Empfang — der kommt in Teil F.)

✅ **Ergebnis:** App läuft bei Cloudflare.

---

# Teil F — Mail-Empfang + eigene Adresse (im Cloudflare-Dashboard)

Zwei Dinge im Browser — kein Terminal mehr.

### F1. Email Routing aktivieren (Mails empfangen)
1. **`https://dash.cloudflare.com`** → deine Domain anklicken.
2. Links im Menü: **„E-Mail" → „E-Mail-Routing"** (Email Routing).
3. **Aktivieren** klicken. Cloudflare legt die nötigen MX-Einträge selbst an → bestätigen.
4. Reiter **„Routingregeln"** (Routing rules): bei **„Catch-All-Adresse"** (alle Adressen):
   - Aktion: **„An Worker senden" / „Send to Worker"**
   - Worker: **`malzimail`** auswählen
   - **Aktivieren/Speichern.**

> Das bedeutet: **Jede** Mail an **irgendeine** Adresse deiner Domain landet bei deiner App — genau das will der Dienst.

### F2. Eigene Domain mit der App verbinden
1. Im Dashboard links: **„Workers & Pages"** → **`malzimail`** anklicken.
2. **„Einstellungen" → „Domains & Routes"** (o. ä.) → **„Hinzufügen" → „Custom Domain"**.
3. Deine Domain eintragen (z. B. `meinedienst.at`) → bestätigen.

✅ **Ergebnis:** `https://meinedienst.at` zeigt deine App, Mails werden empfangen.

---

# Teil G — Erster Test (5 Minuten)

1. **Admin öffnen:** `https://deine-domain/admin`. Beim **allerersten** Aufruf führt dich ein **Einrichtungs-Assistent** durch: Admin-Passwort festlegen → deine **Betreiberdaten** (für Impressum & Datenschutz). Danach landest du im Admin. *(Damit der Assistent erscheint, darf kein `COCKPIT_PASSWORD`-Secret gesetzt sein — der Assistent legt das Passwort selbst an.)*
2. **Workshop starten:** Im Admin auf **„Workshop starten"** klicken → es wird automatisch ein **frischer Teilnehmer-Link** (z. B. `https://deine-domain/?t=marder9530-5wq`) samt **QR-Code** erzeugt. Bei **jedem** Start ein neuer Link.
3. **Als Teilnehmer testen:** den Teilnehmer-Link in einem **privaten/Inkognito-Fenster** öffnen → eine temporäre Adresse erscheint.
4. **Probemail schicken:** Von irgendeinem Mail-Konto eine Mail an diese temporäre Adresse senden → sie muss nach wenigen Sekunden im Posteingang der Seite erscheinen.
5. **Stoppen:** Mit **„Workshop stoppen"** endet der Workshop — alle Wegwerf-Identitäten (Postfach samt zugehörigem Google-Login) werden gemeinsam gelöscht und der Link wird ungültig.

✅ Wenn die Probemail ankommt: **fertig, dein Dienst läuft.**

---

# Google-Logins (Gemini / NotebookLM) — erforderlich

Google ist **fester Bestandteil** des Dienstes (kein optionaler Zusatz). Eigenes Kapitel mit eigener Anleitung: **[google-phase0-anleitung.md](google-phase0-anleitung.md)** (Cloud Identity Free einrichten, Service Account, Schlüssel). Zusätzlicher Aufwand: ~1–2 Stunden. Den Zugang trägst du direkt im **Einrichtungs-Assistenten (Schritt 3)** ein, inkl. „Verbindung testen" — **ohne erfolgreiche Google-Verbindung lässt sich die Einrichtung nicht abschließen** (harter Stopp). Später änderbar im Admin unter „Google-Konfiguration". Es gibt **keinen Extra-Schalter** — alle Teilnehmer:innen erhalten automatisch einen Google-Login.

---

# Wenn etwas hakt — die häufigsten Fehler

| Problem | Wahrscheinliche Ursache |
|---|---|
| Domain wird bei Cloudflare nicht „aktiv" | Nameserver beim Registrar nicht/falsch umgestellt (Teil C) — prüfen, ggf. Stunden warten |
| `wrangler` meldet Authentifizierungs-Fehler (Code 10000) | Anmeldung abgelaufen → nochmal `npx wrangler login` |
| Deploy klappt, aber Seite nicht erreichbar | Custom Domain fehlt (F2) |
| Adresse erscheint, aber Mails kommen nie an | Email Routing nicht aktiv oder Catch-All-Regel zeigt nicht auf den Worker → **Schritt-für-Schritt-Prüfung unten** |
| „command not found: node" | Node.js nicht installiert oder Terminal nicht neu geöffnet (D1/D3) |
| DNS-Eintrag „wirkt nicht" | Eintrag beim Registrar statt bei Cloudflare gemacht (ab Teil C zählt nur Cloudflare!) |

## Mails kommen nicht an? — Empfang Schritt für Schritt prüfen

Das ist die häufigste Hürde, weil Cloudflare Email Routing reiner Dashboard-Status ist,
den der Worker selbst nicht auslesen kann. Prüfe der Reihe nach:

1. **Cloudflare → E-Mail → Email Routing:** Status „Aktiv"? Die von Cloudflare angelegten
   **MX-Einträge** sind unter **DNS** sichtbar (Proxy aus / grau).
2. **Routingregeln → Catch-all-Adresse:** Aktion = „An einen Worker senden", Worker = dein
   Worker-Name, Regel aktiviert **und gespeichert**.
3. **Läuft gerade ein Workshop?** Mails an Adressen eines *gestoppten* Workshops werden
   bewusst verworfen. Im Admin muss „✓ Workshop läuft" (grün) stehen; schicke die Probemail
   an eine **frisch erzeugte** Adresse aus dem **aktuellen** Teilnehmer-Link.
4. **Probemail** von einem fremden Postfach senden, ~1 Minute warten — sie erscheint
   automatisch im Posteingang der Teilnehmer-Seite (kein Knopfdruck nötig).
5. **Logs lesen** mit `npx wrangler tail`: Erreicht die Mail den Worker, wird aber
   verworfen, siehst du jetzt eine Zeile wie `Mail verworfen: Adresse unbekannt oder
   abgelaufen` bzw. `Mail verworfen: Workshop inaktiv oder beendet`. Steht dort **gar
   nichts**, erreicht die Mail den Worker nicht → zurück zu Schritt 1/2 (Routing).
   Erscheint `MAIL_ENCRYPTION_KEY fehlt …`, fehlt das Verschlüsselungs-Secret (Teil E).

---

# Gesamtaufwand ehrlich

- **Teil A–G (Mail-Dienst):** 1–2 Stunden, ohne jede Vorerfahrung 2–3. Größte Hürden: Nameserver-Umstellung (Teil C) und die Terminal-Schritte (Teil E).
- **Google-Teil:** nochmal 1–2 Stunden.
- **Danach:** keine Wartung nötig; der Dienst läuft von allein. Computer nur für spätere Updates nötig (`npx wrangler deploy`).

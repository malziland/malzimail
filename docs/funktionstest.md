# Funktionstest: Mail-Empfang (Cloudflare) und Wegwerf-Google-Konten

Diese Anleitung zeigt, wie man **beweist** — nicht bloß behauptet —, dass eine Instanz
wirklich funktioniert: dass E-Mails ankommen (Cloudflare-Pfad) und dass die
Wegwerf-Google-Konten echt angelegt, verknüpft und wieder gelöscht werden.

Grundgedanke: Du musst **kein** Google-Konto von Hand anlegen. Der Dienst legt jede Wegwerf-Identität
(dieselbe Adresse ist zugleich Postfach **und** Google-Login) selbst an — du **löst die Anlage aus** (Link öffnen) und **meldest dich
testweise damit an**. Du verifizierst also das Ergebnis des Automatismus.

---

## Teil A — Mail-Empfang über Cloudflare

Beweist die ganze Kette: Cloudflare Email Routing → Worker `email()` → Verschlüsselung →
D1 → Anzeige im Teilnehmer-Posteingang.

> **Wichtig:** Die Test-Instanz `malzimail-dev` hat **keine** Mail-Domain — Mail-Empfang
> ist nur auf einer Instanz mit echter Domain + eingerichtetem Email Routing testbar
> (z. B. `deine-domain.at` — deine eigene Domain nach der Installation; siehe Teil F der Anleitung).

1. **Admin** öffnen → **Workshop starten** → Teilnehmer-Link kopieren.
2. Link in einem normalen Browser-Tab öffnen → es wird eine Adresse erzeugt
   (z. B. `dachs4821@deine-domain`).
3. Von **irgendeinem** externen Postfach (privates Gmail, Outlook …) eine Test-Mail an
   genau diese Adresse schicken.
4. Auf der Teilnehmer-Seite **warten** (sie pollt automatisch) — die Mail muss innerhalb
   weniger Sekunden im Posteingang erscheinen, mit Betreff/Absender und lesbarem Inhalt.
   → **Das ist der Beweis, dass der Cloudflare-Mailpfad funktioniert.**
5. *(Optional, Beweis der Verschlüsselung-at-rest)* In der Datenbank steht der Inhalt
   **verschlüsselt**, nicht im Klartext:
   ```bash
   npx wrangler d1 execute malzimail --remote \
     --command "SELECT substr(subject,1,12) AS s, substr(text_body,1,12) AS t FROM messages ORDER BY id DESC LIMIT 1"
   ```
   Erwartung: Werte beginnen mit `ENC2:` (Chiffretext) — nirgends der Klartext-Betreff.
6. **Workshop stoppen** → alle Wegwerf-Identitäten werden gewischt (Postfächer samt zugehörigen Google-Logins), der Link
   wird tot.

---

## Teil B — Wegwerf-Google-Konten (drei Stufen, risikoarm → echter Beweis)

Google ist bei jeder lauffähigen Instanz bereits eingerichtet — der Einrichtungs-Assistent
erzwingt das in Schritt 3 (Service-Account-Schlüssel + Admin-Subject + Konto-Domain, mit
„Verbindung testen" und hartem Stopp; siehe [google-phase0-anleitung.md](google-phase0-anleitung.md)).
Kontingent: **Cloud Identity Free = max. 50 Konten gleichzeitig.** Jeder Test belegt
einen Platz, bis „Stopp"/der Aufräum-Cron ihn wieder freigibt → mit 1–2 Konten testen.

### Stufe 1 — risikolos, legt **kein** Konto an
Admin → **Google-Konfiguration** → **„Verbindung testen"**. Das macht eine reine
Lese-Abfrage (`users.list?maxResults=1`) und bestätigt: Zugangsdaten gültig, API
erreichbar, Domain stimmt. Es entsteht **kein** Konto, es wird **kein** Platz verbraucht.

### Stufe 2 — API-Rauchtest ohne UI: legt **ein** Konto an und löscht es sofort
Beweist, dass **Anlegen UND Löschen** über die echte Worker-Krypto laufen — ohne einen
Workshop zu starten. Auf dem Mac mit dem Service-Account-Schlüssel:
```bash
GOOGLE_SA_KEY_FILE=~/Downloads/<dein-sa-key>.json \
GOOGLE_ADMIN_SUBJECT=admin@id.deine-domain.at \
GOOGLE_ACCOUNT_DOMAIN=deine-domain.at \
  node scripts/test-google-module.mjs
```
Erwartete Ausgabe: `✓ angelegt … ✓ gelöscht … => Worker-Modul funktioniert end-to-end.`
(Der Platz wird sofort wieder frei.)

### Stufe 3 — echter End-to-End-Beweis (das, was der Teilnehmer erlebt)
Nur diese Stufe beweist die **Verknüpfung** wirklich:
1. **Workshop starten** → Teilnehmer-Link öffnen.
2. Auf der Teilnehmer-Seite erscheint die türkise Google-Karte mit **Login**
   (`wort+4ziffern@deine-domain`) und **Passwort** (= Login).
3. Mit **genau diesen Daten** echt anmelden bei <https://gemini.google.com> **oder**
   <https://notebooklm.google.com>. Wenn der Login durchläuft und der Dienst nutzbar ist,
   ist das Konto real, aktiv und korrekt verknüpft. → **Beweis erbracht.**
4. **Workshop stoppen** → das Test-Konto wird automatisch gelöscht (oder der Cron
   entfernt es nach Ablauf). Mit Stufe 1 noch einmal „Verbindung testen" oder im
   Google-Admin prüfen, dass das Konto weg ist.

---

## Was das beweist — und was ehrlicherweise offen bleibt

- Teil A + Teil B/Stufe 3 zusammen beweisen: **Der Dienst funktioniert grundsätzlich
  echt** (Mail kommt an; Wegwerf-Konten werden angelegt, sind nutzbar und werden gelöscht).
- **Nicht** abgedeckt durch einen Einzellauf: das Verhalten unter Last
  (≈ 25 Teilnehmer gleichzeitig, Verhalten nahe der 50-Konten-Grenze, Google-API-Rate-Limits).
  Der echte Härtetest ist der **erste reale Workshop** — das ist so zu benennen, nicht zu
  behaupten.

## Teil C — Beweisen, dass eine **fremde** Installation funktioniert (Clean-Room)

Die Teile A + B beweisen, dass *deine* Instanz funktioniert. Sie beweisen **nicht**, dass
ein Fremder das frisch auf *seiner* Infrastruktur zum Laufen bringt — denn auf deinem
Rechner sind Domain, Cloudflare-Account und Google-Tenant bereits eingerichtet. Den
Fremd-Fall kann man **nur auf unabhängiger Infrastruktur** beweisen. Zwei Wege:

### Variante A — selbst gebauter Clean-Room (du in der Rolle des Fremden)
Mit **vollständig getrennter** Infrastruktur, ohne Insider-Wissen, **nur** der Anleitung folgend:
1. **Zweiter, kostenloser Cloudflare-Account** (andere E-Mail-Adresse — nicht die deiner Haupt-Instanz).
2. **Zweit-/Wegwerf-Domain**, die nie mit malzimail zu tun hatte (Nameserver auf den neuen Account).
3. **Frischer Cloud-Identity-Free-Tenant auf einer anderen Domain** mit eigenem Service-Account
   + domainweiter Delegierung für die Test-Domain — *nicht* die Subdomain deiner Haupt-Instanz. (Pflicht: Ohne gültige Google-Konfiguration lässt der Einrichtungs-Assistent die Installation nicht abschließen.)
4. Repo frisch klonen, **nur** [installation-anleitung.md](installation-anleitung.md) folgen:
   `wrangler.example.jsonc` → `wrangler.jsonc` kopieren, **alle** `<<…>>`-Platzhalter ersetzen,
   neue D1 anlegen, Migrationen 0001–0006 anwenden, Secrets via `wrangler secret put` setzen, deployen.
5. Setup-Assistent durchklicken: Betreiberdaten + Google (Schritt 3, mit „Verbindung testen" — Pflicht), dann Workshop starten.
6. Prüfen, dass die im Setup-Schritt 3 hinterlegte Google-Konfiguration greift: im „Google-Konfiguration"-Modal erneut **„Verbindung testen"** ausführen.
7. **Probemail** von einem externen Konto an eine frisch erzeugte Teilnehmer-Adresse.

**„Grün" heißt hier konkret:**
- Deploy ohne Fehler; Custom Domain wird „aktiv"; `/admin` zeigt **„Anmelden"** (nicht „Passwort festlegen").
- Setup-Assistent legt den einen Workshop an; Teilnehmer-Link liefert HTTP 200.
- `/api/address` erzeugt eine Adresse **auf der neuen Domain** (nicht auf der Haupt-Domain — zugleich der Live-Test für die entschärfte Domain-Falle).
- „Verbindung testen" gegen den fremden Tenant meldet **Erfolg**; ein Teilnehmer-Google-Login wird real angelegt und beim Stopp gelöscht.
- **Probemail kommt im Posteingang an** (entschlüsselt lesbar) — Beweis für den Cloudflare-Mailpfad.
- Impressum/Datenschutz zeigen **nur** die im Setup eingegebenen Daten, keine malziland-Registerdaten; Footer „powered by malziMAIL".

### Variante B — echter Beta-Tester als „Fremder" (stärkster Beweis)
Ein Dritter mit eigenem Cloudflare-Account, eigener Domain und optional eigenem Tenant macht
die Schritte 4–7 **allein**, nur mit der Anleitung. Gleiche Grün-Kriterien. Sein Stolpern zeigt
Anleitungs-Lücken, die dem Entwickler am eigenen Rechner nie auffallen.

> **Ehrliche Grenze:** Cloudflare Email Routing ist Dashboard-Status, den der Worker nicht
> auslesen kann; eine grüne Test-Suite beweist den Fremd-Fall nicht (sie testet Logik, nicht die
> echte Cloudflare-/Google-Verdrahtung). Der belastbare Beweis ist erst der Clean-Room-Lauf —
> Variante B am stärksten.

## Schnell-Checkliste

| Test | Wie | Beweist |
|---|---|---|
| Mail-Empfang | Test-Mail an erzeugte Adresse → erscheint im Posteingang | Cloudflare-Pfad (Routing→Worker→D1→Anzeige) |
| Verschlüsselung | `wrangler d1 … SELECT … messages` zeigt `ENC2:` | Inhalte ruhen verschlüsselt |
| Google-Zugangsdaten | Admin → „Verbindung testen" | Schlüssel/Subject/Domain gültig (kein Konto) |
| Google anlegen+löschen | `node scripts/test-google-module.mjs` | Worker-Krypto + Admin-SDK end-to-end |
| Google nutzbar | Teilnehmer-Login bei Gemini/NotebookLM | Konto real, aktiv, verknüpft |

## Manueller Tastatur-Smoketest (Barrierefreiheit)

Der automatische Check (`npm run test:a11y`, axe-core) prüft die Seitenstruktur;
Bedienbarkeit per Tastatur muss ein Mensch prüfen. Vor jedem Release einmal
**ohne Maus** durchspielen (Tab / Shift+Tab / Enter / Esc):

1. Teilnehmerseite (`/?t=…`): mit Tab durch alle Bedienelemente — der
   **Fokus-Rahmen muss immer sichtbar** sein; „Adresse erzeugen" und die
   Kopier-Buttons per Enter auslösbar; eine Mail in der Liste per Tastatur
   öffnen und wieder schließen.
2. Admin (`/admin`): Anmelden nur per Tastatur; „Workshop starten/stoppen"
   erreichen; das Stopp-Modal mit Esc bzw. über den Abbrechen-Knopf verlassen
   (Fokus darf nicht im Modal „gefangen" bleiben, wenn es geschlossen ist).
3. Beide Themes (hell/dunkel) stichprobenartig: Fokus-Rahmen bleibt erkennbar.

„Grün" = alle drei Punkte ohne Griff zur Maus möglich.

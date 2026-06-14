# Was du brauchst, um malzimail selbst zu betreiben

Diese Liste beschreibt ehrlich, was ein:e Nutzer:in **wirklich** braucht — Konten, Werkzeuge, Vorkenntnisse und Zeit. Stand: aktuelle Code-Basis (Open-Source-Modell: ein Betreiber, ein Workshop, Google verpflichtend).

---

## 1. Konten & Geld

| Was | Wofür | Kosten |
|---|---|---|
| **Eigene Domain** (z. B. `meinedienst.at`) | die Adresse deines Dienstes + Empfang der Wegwerf-Mails | einmalig/jährlich beim Registrar (Preis je nach Endung/Anbieter — vor dem Kauf dort nachsehen) |
| **Cloudflare-Account** | hier läuft alles: App, Datenbank, Mail-Empfang | 0 € (Gratis-Stufe reicht) |
| **Google-Konto + Cloud Identity Free** *(erforderlich)* | für die Wegwerf-Google-Logins (Gemini/NotebookLM) — fester Bestandteil des Dienstes | 0 € (bis 50 Konten gleichzeitig) |

**Laufende Kosten insgesamt: nur die Domain.**

## 2. Werkzeuge auf dem eigenen Computer

Hier liegt die ehrlich größte Hürde — **die Installation passiert über die Kommandozeile (Terminal):**

| Werkzeug | Was es ist | Wofür |
|---|---|---|
| **Terminal** | das „Befehls-Fenster" des Computers (bei Mac/Windows/Linux vorhanden) | Befehle eingeben |
| **Node.js** | eine Laufzeitumgebung, kostenloser Download von nodejs.org | Voraussetzung für Wrangler |
| **Wrangler** | das „Hochlade-Werkzeug" für Cloudflare (`npx wrangler …`); muss nicht extra installiert werden, Node.js genügt | App zu Cloudflare hochladen, Datenbank anlegen, Geheimnisse hinterlegen |

**Wichtig:** Diese Werkzeuge braucht man **nur zum Installieren und Aktualisieren**. Der fertige Dienst läuft komplett bei Cloudflare — der eigene Computer kann danach ausgeschaltet sein.

## 3. Vorkenntnisse (ehrliche Selbsteinschätzung)

Du solltest dich trauen:
- eine **Domain zu kaufen** und ihre **Nameserver umzustellen** (Anleitung vorhanden, aber man muss sich bei zwei Anbietern zurechtfinden),
- **DNS-Einträge** anzulegen (Typ, Name, Wert in ein Formular eintragen),
- **5–10 Befehle ins Terminal zu kopieren** und Enter zu drücken (kein Programmieren — nur kopieren, einfügen, Ergebnis lesen).

Wer das noch nie gemacht hat, schafft es mit dieser Schritt-für-Schritt-Anleitung — am einfachsten **mit Unterstützung eines KI-Assistenten** (z. B. Claude Code oder ChatGPT/Codex), der die Schritte mit dir durchgeht, die Konfiguration schreibt und die Befehle ausführt: siehe [installation-mit-ki.md](installation-mit-ki.md). Plane trotzdem 1–2 Stunden Zeit und etwas Geduld ein.

## 4. Ablauf der Installation (Überblick, Teil A = Mail-Dienst)

1. Domain kaufen (beliebiger Registrar)
2. Cloudflare-Account anlegen, Domain hinzufügen, **Nameserver beim Registrar auf Cloudflare umstellen**
3. Node.js installieren, Projekt herunterladen
4. Im Terminal: `npx wrangler login` (Browser öffnet sich → erlauben)
5. `npx wrangler d1 create …` (Datenbank anlegen) + ID in die Konfigurationsdatei eintragen
6. `npx wrangler d1 migrations apply … --remote` (Datenbank-Tabellen anlegen)
7. Geheimnisse setzen: `npx wrangler secret put MAIL_ENCRYPTION_KEY`, `COCKPIT_PASSWORD` …
8. `npx wrangler deploy` (App geht online)
9. Im Cloudflare-Dashboard: **Email Routing aktivieren** + Catch-All-Regel auf den Worker stellen
10. Im Dashboard: **Custom Domain** für den Worker setzen
11. Test: Einrichtungs-Assistenten abschließen, Workshop starten, Teilnehmer-Link öffnen, Probemail schicken

**Zeitaufwand realistisch: 1–2 Stunden** (mit Anleitung, ohne Vorerfahrung eher 2–3).

## 5. Konfiguration nach der Installation

| Einstellung | Wo / wie |
|---|---|
| Admin-Passwort | beim ersten Aufruf von `/admin` bzw. im Einrichtungs-Assistenten selbst festlegen |
| Domain, Laufzeiten, Limits | Konfigurationsdatei (`wrangler.jsonc`); max. Lebensdauer der Wegwerf-Identitäten 48 h |
| Impressum/Betreiberdaten | im Einrichtungs-Assistenten bzw. über die Einstellungs-Seite im Admin pflegbar |
| Google-Anbindung (Schlüssel, Domain) | im Einrichtungs-Assistenten (Schritt 3) verpflichtend eintragen + „Verbindung testen"; verschlüsselt gespeichert, später per „Google-Konfiguration"-Modal im Admin änderbar |
| Workshop starten/stoppen | im Admin über die Workshop-Karte (frischer Teilnehmer-Link beim Start, Stopp wischt alles) |

## 6. Google-Logins (erforderlich, Teil des Setups)

Google ist **kein optionaler Zusatz mehr** — der Dienst funktioniert nur mit E-Mail **und** Google-Login. Die Google-Zugangsdaten werden im **Einrichtungs-Assistenten (Schritt 3)** abgefragt und per „Verbindung testen" geprüft; ohne erfolgreiche Verbindung lässt sich die Einrichtung nicht abschließen (harter Stopp). Zusätzlich zu oben:
1. **Subdomain** festlegen (z. B. `id.meinedienst.at`) — kostet nichts, gehört zur Domain
2. **Cloud Identity Free** anmelden (Telefonnummer zur Bestätigung nötig!) + Subdomain per TXT-Eintrag bestätigen
3. **Google-Cloud-Projekt** anlegen, **Admin SDK API** aktivieren
4. **Service Account** anlegen, **JSON-Schlüssel** herunterladen, **domänenweite Delegierung** in der Admin-Konsole eintragen
5. **Gemini + NotebookLM** in der Google-Admin-Konsole einschalten
6. Service-Account-JSON, Admin-Subject und Konto-Domain im **Einrichtungs-Assistenten (Schritt 3)** eintragen und „Verbindung testen" — damit ist die Einrichtung abgeschlossen (kein extra Cloudflare-Secret, kein Trainer-Schalter nötig; später im Admin änderbar)

**Zeitaufwand: nochmal 1–2 Stunden.** Bekannte Stolpersteine: Telefon-Verifizierung kann zicken („Nummer zu oft verwendet"), Anmeldeformular drängt Richtung kostenpflichtigem Workspace (richtig ist die Free-Edition), DNS-Eintrag muss dort gemacht werden, wo die Nameserver wirklich liegen.

Detail-Anleitung: [google-phase0-anleitung.md](google-phase0-anleitung.md)

---

## Kurzfassung

> **Pflicht:** 1 Domain (einzige laufende Kosten) · 1 Cloudflare-Account (gratis) · 1 Computer mit Node.js + Terminal-Grundmut · 1–2 Stunden.
> **Ebenfalls Pflicht (Google):** 1 (Sub-)Domain für den Google-Bereich · Cloud Identity Free (gratis, Telefon nötig) · Google-Cloud-Projekt mit Service Account · nochmal 1–2 Stunden. Ohne diesen Zugang lässt sich die Einrichtung nicht abschließen.
> **Danach:** Der Dienst läuft von allein bei Cloudflare; der eigene Computer wird nur noch für Updates gebraucht.

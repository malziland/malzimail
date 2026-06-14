# Konzept: Umbau zur Open-Source-Version — ohne Risiko für den laufenden Dienst

> ✅ **Stand: Umbau abgeschlossen — malzimail ist mit v1.0.0 veröffentlicht.** Dieses Dokument hält den damals geplanten Weg (Phasen 0–6) als Entscheidungs- und Design-Protokoll fest.

## Getroffene Entscheidungen (11.06.2026)

| Frage | Entscheidung | Konsequenz |
|---|---|---|
| Eigene Instanz malzimail.at? | **wird ebenfalls auf Einzel-Workshop umgestellt** | kein Dauer-Doppelmodus nötig — ein Code, ein Verhalten; für die Live-Instanz gibt es einen einmaligen Migrationsschritt |
| Sprache | **nur Deutsch** | kein Übersetzungsaufwand |
| Projektname | **„malzimail" wird freigegeben** | Repo + App heißen malzimail; jeder Betreiber setzt im Assistenten eigenen Dienst-Namen + Betreiberdaten |
| Erst-Veröffentlichung | **Mail + Google untrennbar zusammen** | es gibt keine Variante ohne Google; mit v1.0.0 veröffentlicht (alle Phasen abgeschlossen) |

## Ziel

Aus malzimail wird eine selbst-hostbare Open-Source-App: Setup-Assistent statt Terminal-Konfiguration, **ein** Workshop pro Instanz statt Trainer-Verwaltung, Google als fester Pflicht-Bestandteil (bei der Einrichtung verpflichtend zu konfigurieren). Dabei gilt: **Der laufende Dienst auf malzimail.at darf zu keinem Zeitpunkt beeinträchtigt werden.**

---

## Leitprinzip 1: Verstecken statt herausreißen

Die wichtigste Architektur-Entscheidung: **Die Trainer-Tabelle und ihre gesamte Logik bleiben unangetastet.** Nur die Sicht darauf ändert sich.

**Warum:** Am Trainer hängt heute fast alles — Adress-Erzeugung, Mail-Annahme (Aktivfenster-Prüfung), Limits, Statistik, Google-Schalter, Stop-/Aktivierungs-Links. Würde man die Tabelle entfernen oder umbenennen, müsste man jede dieser Stellen anfassen → maximales Risiko. Stattdessen:

- Die OSS-Instanz erzeugt beim Setup **genau einen** Trainer-Datensatz (intern „Standard-Workshop").
- **Alle bestehende Logik läuft unverändert weiter** — sie sieht einfach nur einen einzigen Trainer.
- Nur die **Admin-Oberfläche** zeigt statt Trainer-Liste + Anlege-Formular eine einzelne **Workshop-Karte** (Start/Stopp, Link + QR, Statistik, Link neu erzeugen).
- Die Trainer-Verwaltungs-Aktionen (`create`, `disable`, `delete`, …) werden im Backend **nicht gelöscht**, sondern nur nicht mehr in der Oberfläche angeboten. (Aufräumen kann man sie ganz am Ende, wenn alles läuft.)

**Effekt:** Datenbank-Schema unverändert, E-Mail-Pfad unverändert, API unverändert. Das „saubere Herausbekommen" des Trainer-Anlegens ist damit eine reine **Oberflächen-Änderung** — die gefährlichen Schichten bleiben unberührt.

## Leitprinzip 2: Fallback-Kette für jede Konfiguration

Jede Einstellung bekommt eine feste Vorrang-Reihenfolge:

```
1. Datenbank (Settings-Tabelle, vom Assistenten befüllt)   ← neu
2. Environment-Variable / Secret (wie heute)               ← bleibt
3. Eingebauter Standardwert                                 ← bleibt
```

**Warum das den Live-Betrieb schützt:** Auf malzimail.at ist die Settings-Tabelle anfangs **leer** → die App nutzt weiterhin exakt die heutigen Secrets/Variablen (`COCKPIT_PASSWORD`, `MAIL_ENCRYPTION_KEY`, Google-Secrets). **Jeder Deploy der neuen Version verhält sich auf der bestehenden Instanz identisch zu heute.** Erst wer den Assistenten durchläuft (neue Instanzen), befüllt Stufe 1.

Gleiches Muster für die Betreiberdaten: Impressum/Datenschutz lesen künftig aus den Settings — sind die leer, greifen die heutigen `COMPANY`-Konstanten. De-Personalisierung passiert dadurch **graduell und gefahrlos**; die Konstanten fliegen erst am Schluss raus.

## Leitprinzip 3: Erst auf Zweit-Instanz testen, dann live

Für den Umbau wird eine **zweite Worker-Instanz** angelegt (`malzimail-dev`, eigene D1-Datenbank, workers.dev-Adresse, kostenlos). Jede Phase wird dort komplett durchgespielt — inklusive „leere Datenbank → Assistent erscheint" — **bevor** sie auf malzimail.at deployt wird. Die Produktiv-Instanz bekommt nur erprobte Stände.

---

## Die neue Settings-Tabelle (einzige Schema-Änderung)

Eine simple Schlüssel-Wert-Tabelle, additiv (Migration 0006):

```sql
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT,            -- bei Geheimnissen: verschlüsselt (AES-GCM, vorhandene crypto.js)
  updated_at INTEGER
);
```

Darin landen: `admin_password_hash`, Betreiberdaten (Name, Impressum-Felder, Kontakt), Dienst-Name, Limits, `google_sa_key` (verschlüsselt), `google_subject`, `google_domain`, `setup_completed`.

**Ein ehrlicher Punkt dazu:** Der Verschlüsselungs-Schlüssel (`MAIL_ENCRYPTION_KEY`) selbst kann **nicht** in die Datenbank (Henne-Ei-Problem — womit sollte er verschlüsselt sein?). Er bleibt ein Worker-Secret. Beim Deploy-Knopf-Weg lässt er sich aber automatisch beim ersten Start erzeugen und als Secret ablegen — Detail für Phase 4.

---

## Phasen (jede einzeln deploybar, jede rückwärtskompatibel)

### Phase 1 — Settings-Fundament + Admin-Passwort aus DB
- Migration 0006 (additiv). Settings-Lese-/Schreibfunktionen mit Fallback-Kette.
- `/admin`: Existiert weder `admin_password_hash` (DB) noch `COCKPIT_PASSWORD` (Secret) → **Assistent Schritt 1** (Passwort festlegen). Sonst: Login wie heute.
- „Passwort ändern"-Funktion im Admin.
- **Risiko für Live: keines** — auf malzimail.at existiert `COCKPIT_PASSWORD`, also erscheint dort nie der Assistent.

### Phase 2 — Assistent Schritt 2+3 (Betreiberdaten + Standard-Workshop)

**Grundsatz (11.06.2026): Der Admin IST der Trainer — automatisch und untrennbar.** Es gibt keine getrennten Identitäten: Wer die Instanz einrichtet, besitzt den (einzigen) Workshop. Die Trainer-Verwaltung entfällt später komplett (Phase 3); deshalb muss der Workshop ohne eigenen Verwaltungsschritt aus dem Setup heraus entstehen.

- Schritt 2: Formular für Dienst-Name + Betreiberdaten → Settings. Impressum/Datenschutz/Footer rendern aus Settings, Fallback auf `COMPANY`.
- Schritt 3: **Workshop-Link festlegen.** Der Assistent fragt den **Link-Namen (Token)** ab — vorbefüllt mit einem generierten Vorschlag, überschreibbar (Hinweis: „Dieser Name steht im Link, den deine Teilnehmer:innen öffnen — z. B. `deine-domain.at/?t=NAME`"). Daraus legt das Setup automatisch den **einen** Trainer-Datensatz an (= der Admin selbst; Secret generiert, verschlüsselt abgelegt) und merkt ihn als `default_workshop_token` in den Settings.
- **Keine Pflicht-Limits (11.06.2026):** Jeder Betreiber ist für seine eigene Instanz selbst verantwortlich → der Standard-Workshop wird **ohne Tageslimits** angelegt (`daily_used_limit`/`daily_gen_limit` = NULL). Die Trainer-Typen (trial/standard/premium) entfallen ersatzlos. Optional kann später ein freiwilliges Limit über die Settings gesetzt werden (Selbstschutz, z. B. gegen Link-Leaks) — aber nichts ist erzwungen. *Ehrlicher Hinweis:* Das harte Google-Limit (50 Konten gleichzeitig) bleibt naturgemäß bestehen und wird weiterhin mit freundlicher Meldung abgefangen.
- **Google ohne Häkchen (11.06.2026):** Die Google-Funktion ist fester Pflicht-Bestandteil: Die Einrichtung verlangt in Schritt 3 verpflichtend gültige Google-Zugangsdaten (mit „Verbindung testen" + hartem Stopp) — ohne sie lässt sich die Installation nicht abschließen. Es gibt keinen per-Trainer-Schalter. Kein per-Trainer-Schalter mehr. Technisch: Der Standard-Workshop wird mit `google_enabled=1` angelegt; aktiv wird die Funktion erst, wenn `googleConfig()` Zugangsdaten findet (Settings oder Secrets). Der „Google AN/AUS"-Schalter verschwindet in Phase 3 aus der Oberfläche.
- Abschluss-Seite: Workshop-Link + QR + Aktivierungs-/Stopp-Link — **sofort arbeitsfähig, ohne je ein Trainer-Formular zu sehen.** (Das bestehende Dashboard zeigt den Workshop ab dann automatisch an; die hübsche Einzel-Karte kommt in Phase 3.)
- Nach Phase 1 / vor Phase 2 ist das Admin auf einer frischen Instanz bewusst „leer" — bekannter Zwischenstand, kein Fehler.
- **Risiko: keines** — Assistent erscheint nur, wenn kein Passwort konfiguriert ist (Phase-1-Regel). Live ist nie betroffen.

### Phase 3 — Admin-Oberfläche: Workshop-Karte statt Trainer-Verwaltung
- Neue Admin-Startseite: **eine** Workshop-Karte (Status, Start/Stopp, Link + QR, Statistik, „Link neu erzeugen") + Einstellungs-Seite. **Ohne** Limit-Felder und **ohne** Google-Schalter (folgt der Konfiguration, s. Phase 2).
- **Vorbereitung für die Laufzeit-Slider-Idee (Roadmap):** Alle Zeitlogik bleibt Timestamp-basiert (`active_until`, `expires_at` — ist schon so); die Aktivierungs-Dauer wird über die Settings-Kette aufgelöst (`workshop_hours` → `ACTIVATION_HOURS` → Default) statt fest verdrahtet; Lösch-/Aufräum-Logik bleibt zentral im Cron. Damit ist eine spätere variable Dauer (6 h … dauerhaft) reine UI-Arbeit, kein Umbau.
- Trainer-Liste, Anlege-Formular und Trainer-Aktionen verschwinden aus der Oberfläche (Backend-Routen bleiben bis Phase 5).
- **Migration der Live-Instanz (einmalig, beim Umstieg auf das Einzel-Workshop-Modell):** Der bestehende Trainer „malziland" wird zum Standard-Workshop erklärt (Markierung in Settings: `default_workshop_token`). Weitere vorhandene Trainer-Datensätze bleiben in der Tabelle (Adress-Verweise!), werden aber deaktiviert (`enabled=0`) — bestehende Adressen laufen normal aus, neue entstehen nur noch über den Standard-Workshop. Kein Datenverlust, kein Bruch.
- **Risiko: gering** — UI-Schicht + eine gezielte, reversible Daten-Markierung; Mail-Empfang/API unberührt.

### Phase 4 — Google-Konfiguration: Pflicht-Schritt 3 im Einrichtungs-Assistenten (+ späteres Änderungs-Modal im Admin)
- Einstellungs-Abschnitt „Google-Konten": Schlüssel-JSON einfügen (wird verschlüsselt gespeichert), Admin-Konto, Domain.
- **„Verbindung testen"-Knopf:** legt 1 Testkonto an und löscht es sofort — sofortiges, ehrliches Feedback.
- `googleConfig()` liest die Pflicht-Konfiguration: zuerst die im Assistenten (Schritt 3) hinterlegten Settings, für die Altinstanz übergangsweise die bestehenden Secrets — einen „aus"-Zustand gibt es nicht, ohne gültige Google-Konfiguration ist keine Einrichtung möglich.
- **Risiko: keines** — die bestehende Live-Instanz nutzt übergangsweise weiter ihre Secrets; jede Neuinstallation muss Google im Assistenten-Schritt 3 verpflichtend konfigurieren.

### Phase 5 — Aufräumen + Veröffentlichung (Mail + Google zusammen, nur Deutsch)
- Letzter Schwung: `COMPANY`-Konstanten + Trainer-Verwaltungs-Code entfernen (jetzt gefahrlos, weil überall Settings greifen), Seed-Referenzen raus, `ADMIN_TRAINER_TOKEN`-Var entfernen.
- Repo „malzimail" öffentlich (GitHub), Lizenz wählen (Empfehlung: MIT — kurz, maximal permissiv; Entscheidung bei Veröffentlichung), README deutsch.
- Deploy-Knopf einrichten (`package.json`-Deploy-Script inkl. Migrationen), bebilderte Kurzanleitung für Domain/Nameserver/Email-Routing (Basis: docs/installation-anleitung.md).
- Erprobt auf `malzimail-dev` UND auf malzimail.at; danach mit v1.0.0 veröffentlicht.

## Qualitäts-Säulen (Enterprise-Anspruch — gelten ab Phase 0 für JEDE Phase)

### Säule 1: Tests von Anfang an
- **Test-Werkzeug:** Vitest mit dem offiziellen Cloudflare-Workers-Testpool (`@cloudflare/vitest-pool-workers`) — testet den Worker in echter Workers-Laufzeit inkl. lokaler D1.
- **Test-Ebenen:**
  1. **Unit-Tests** — reine Funktionen (Namensgenerator, Fallback-Kette, Krypto, Settings-Logik)
  2. **Integrations-Tests** — API-Endpunkte gegen lokale D1 (Adresse erzeugen, Limits, Setup-Flow, Auth)
  3. **Smoke-Test nach Deploy** — kleines Skript prüft Live: Startseite lädt, Admin antwortet, API erzeugt Adresse
- **Regel:** Kein Phasen-Abschluss ohne grüne Tests. Bestehende Funktionen bekommen in Phase 0 **Bestandsschutz-Tests** (heutiges Verhalten festschreiben), damit jeder Umbau Regressionen sofort sichtbar macht.
- **CI:** GitHub Actions — bei jedem Push: Linter + alle Tests. Merge nur bei grün.

### Säule 2: Dokumentation wächst mit dem Code
Doku ist Teil jeder Phase, nicht Nacharbeit. Zielstruktur (deutsch):
- `README.md` — was es ist, Screenshot, Deploy-Knopf, Quickstart
- `docs/installation-anleitung.md` + `installation-voraussetzungen.md` (vorhanden, werden je Phase aktualisiert)
- `docs/konfiguration.md` — alle Einstellungen, Fallback-Kette, Secrets
- `docs/architektur.md` — Komponenten, Datenmodell, Entscheidungen (für Mitentwickler)
- `docs/google-einrichtung.md` — aus der Phase-0-Anleitung destilliert
- `CHANGELOG.md` — jede Version, menschenlesbar
- `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `SECURITY.md` (Meldeweg für Sicherheitslücken)
- **Regel:** Eine Phase ist erst fertig, wenn die betroffene Doku-Seite aktualisiert ist.

### Säule 3: Lizenz & Recht — VOR der Veröffentlichung klären
- **Lizenz-Kandidaten:** MIT (maximal einfach/permissiv) vs. Apache-2.0 (zusätzlich expliziter Patentschutz + Marken-Klausel — relevant, weil „malzimail" freigegeben wird) vs. AGPL (Copyleft: wer es als Dienst betreibt und ändert, muss Änderungen offenlegen). **Vorprüfung nötig:** Lizenzen der Abhängigkeiten (postal-mime, qrcode-svg) auf Verträglichkeit checken. Entscheidung als eigener Punkt in Phase 5, mit Recherche.
- **Rechtliche Einordnung (ehrlich):**
  - Die **Software zu veröffentlichen** ist rechtlich der unkritischste Teil — Werkzeuge sind neutral, die Lizenz schließt Gewährleistung/Haftung aus.
  - Die **Verantwortung liegt beim jeweiligen Betreiber

| Phase | Liefert | Fertig, wenn … | Aufwand (grob) |
|---|---|---|---|
| 0 | Test-Instanz `malzimail-dev` (eigener Worker + D1) | dev-Instanz erreichbar, Mail-Test dort ok | 1 kurze Session |
| 1 | Settings-Tabelle, Passwort-Setup, Login aus DB | dev (leer): Assistent erscheint, Passwort setzen, Login ok · live: verhält sich unverändert | 1 Session |
| 2 | Assistent Schritt 2+3, Impressum aus Settings, Standard-Workshop | dev: kompletter Erstlauf bis Workshop-Link + QR; Rechtsseiten zeigen eingegebene Daten | 1–2 Sessions |
| 3 | Workshop-Karte im Admin, Live-Migration malzimail.at | dev + live: Start/Stopp, Link, Statistik über die Karte; live: Adresse erzeugen + Probemail ok | 1–2 Sessions |
| 4 | Google als Pflicht-Schritt 3 im Assistenten + „Verbindung testen" | dev: Einrichtung lässt sich nur mit erfolgreich getesteter Google-Verbindung abschließen (harter Stopp), Teilnehmer-Karte erscheint | 1 Session |
| 5 | Aufräumen, Repo, Deploy-Knopf, Doku | fremde Person kann per Knopf + Anleitung eine eigene Instanz aufsetzen (Realtest!) | 2+ Sessions |

(„Session" = ein gemeinsamer Arbeitsblock wie heute; bewusst grob — keine Stundenversprechen.)

---

## Risiko-Matrix

| Risiko | Schutz |
|---|---|
| Live-Dienst bricht durch Deploy | Fallback-Kette: leere Settings = exakt heutiges Verhalten; jede Phase zuerst auf `malzimail-dev` |
| Datenverlust | nur additive Migrationen; Trainer-Tabelle wird nie umgebaut/gelöscht |
| Assistent erscheint fälschlich auf Live | Bedingung ist „kein Passwort konfiguriert" — auf Live existiert das Secret |
| Google-Schlüssel-Sicherheit in DB | AES-GCM-verschlüsselt (vorhandene crypto.js); Profi-Weg über Secrets bleibt parallel bestehen |
| Halbfertiger Zustand bei Abbruch | Phasen sind einzeln vollständig; nach jeder Phase ist die App konsistent nutzbar |

## Test-Plan je Phase

1. Syntax + lokaler Lauf (`wrangler dev`).
2. Deploy auf `malzimail-dev` (leere DB): kompletter Assistent-Durchlauf, Workshop-Link, Mail-Test, Google-Test.
3. Deploy auf `malzimail-dev` mit **kopierten Live-Daten**: prüfen, dass sich nichts ändert (Fallback-Pfad).
4. Erst dann Deploy auf malzimail.at + kurzer Live-Smoke-Test (Admin-Login, Adresse erzeugen, Probemail).

# Google Cloud Identity Free — Einsteiger-Anleitung (Schritt für Schritt)

Diese Anleitung setzt **null Vorwissen** voraus. Du arbeitest einfach **Teil A bis H der Reihe nach** ab. Bei jedem Schritt steht: **welche Internet-Adresse du öffnest**, **was du dort siehst** und **was du anklickst oder einträgst**.

---

## ⭐ Zuerst: deine drei wichtigsten Fragen — klar beantwortet

**1. „Gibt es eine Seite cloudidentityfree.com?"**
> **Nein.** So eine Seite gibt es nicht — gib sie NICHT ein (Betrugsgefahr). Die **einzige richtige** Anmelde-Adresse ist:
> **`https://workspace.google.com/gcpidentity/signup?sku=identitybasic`**
> (Das `?sku=identitybasic` am Ende sorgt dafür, dass du die **kostenlose** Variante bekommst.)

**2. „Brauche ich einen neuen Google-Account oder nehme ich meinen bestehenden?"**
> Du bekommst während der Anmeldung **einen komplett neuen Login** auf deiner eigenen Domain, z. B. `admin@deine-test-domain.at`.
> - Deinen **normalen Gmail-Account benutzt du NICHT zum Einloggen.** Er wird nur einmal als **Notfall-Kontakt** (für Passwort-Vergessen) eingetragen.
> - Ab dann loggst du dich für alles „Google-Verwaltung" mit dem **neuen** Konto `admin@deine-test-domain.at` ein.
> - Beleg: Google sagt, dieses Admin-Konto „muss sich von der E-Mail unterscheiden, die du [als Kontakt] eingegeben hast" und endet **nicht** auf `@gmail.com` ([Quelle](https://docs.cloud.google.com/identity/docs/how-to/set-up-cloud-identity-admin)).

**3. „Brauche ich die komplizierten Programmierer-Schritte (Service Account, API)?"**
> **Für diesen Test: NEIN.** Die stehen ganz unten im **Anhang** und sind erst viel später dran (wenn wir das automatische Anlegen bauen). Ignoriere sie jetzt.

> 💡 **Falls eine Google-Seite bei dir etwas anders aussieht oder auf Englisch ist:** Das ist normal, Google ändert die Menüs laufend. Die **Reihenfolge** stimmt. Wenn du einen Menüpunkt nicht findest, nutze die **Suche oben** auf der jeweiligen Seite.

---

## Was du am Ende dieses Tests weißt

- Funktioniert ein neu angelegtes Konto **sofort**, ohne extra Anmelde-Hürde?
- Funktionieren **Gemini** und **NotebookLM** damit?
- Kann man sich damit bei **Suno, Gamma, ChatGPT, Claude** „mit Google" anmelden?
- Kommt bei mehreren Logins gleichzeitig eine **Telefon-Abfrage**?

---

# Teil A — Eine Domain besorgen (das brauchst du zuerst)

**Was ist eine Domain?** Eine Internet-Adresse, z. B. `beispiel.de`. Für diesen Google-Dienst brauchst du eine **eigene** — Google verschenkt oder verkauft hier **keine**. Du musst also vorher **eine besitzen**.

- ⚠ **Nimm NICHT deine Produktions-Domain** (die schon für echte E-Mails in Verwendung ist) — sie würde sich mit Google beißen.
- Du brauchst also **eine zweite, günstige Domain** nur für die Google-Logins (z. B. irgendwas wie `ki-workshop-test.com`).

**Empfehlung:** Kauf sie bei einem beliebigen Registrar (z. B. **Cloudflare** oder Namecheap).

**Adresse zum Öffnen:** **`https://dash.cloudflare.com`**

1. Einloggen (dein bestehender Cloudflare-Account).
2. Links im Menü auf **„Domain-Registrierung"** → **„Domains registrieren"** klicken.
   - (Falls anders benannt: oben nach **„Register"** oder **„Domain"** suchen.)
3. Einen freien Namen suchen (z. B. `ki-workshop-test.com`). Der **Preis** wird dort angezeigt — die aktuelle Preisliste steht auf der Seite des Registrars.
4. Domain **kaufen**.

✅ **Ergebnis:** Du besitzt jetzt eine zweite Domain, und ihre Einstellungen (DNS) liegen bei Cloudflare — dort tragen wir in **Teil C** einen kleinen Bestätigungs-Eintrag ein.

---

# Teil B — Bei „Cloud Identity Free" anmelden

**Was ist das überhaupt?** „Cloud Identity" ist Googles **Verwaltung für eigene Benutzerkonten** auf deiner Domain. **„Free"** heißt: **kostenlos bis 50 Konten gleichzeitig.** Damit kannst du später Wegwerf-Konten anlegen, mit denen man Gemini/NotebookLM nutzt.

**Adresse zum Öffnen (die aus Frage 1 oben):**
**`https://workspace.google.com/gcpidentity/signup?sku=identitybasic`**

Der Anmelde-Assistent fragt dich der Reihe nach (offiziell bestätigte Reihenfolge, [Quelle](https://docs.cloud.google.com/identity/docs/how-to/set-up-cloud-identity-admin)):

1. **Dein Name** (Vor- und Nachname).
2. **Deine aktuelle E-Mail-Adresse** — z. B. dein normales Gmail oder deine Admin-E-Mail. Das ist nur der **Notfall-Kontakt**, NICHT dein späterer Login.
3. **Name deiner Organisation/Firma** (z. B. „Meine Test-Organisation").
4. **Land** (Österreich).
5. **Deine Domain** — hier trägst du die aus **Teil A** ein (z. B. `ki-workshop-test.com`).
6. **Neues Admin-Konto erstellen:** Benutzername + Passwort, z. B. `admin@ki-workshop-test.com`.
   → **Das ist ab jetzt dein Login** für alles Google-Verwaltungs-mäßige. Merke dir Benutzer + Passwort gut.

✅ **Ergebnis:** Du hast einen kostenlosen Google-Verwaltungsbereich und ein Admin-Konto auf deiner Domain.

> ⚠ Falls der Assistent plötzlich **Geld/Kreditkarte** verlangt: Du bist wahrscheinlich versehentlich in einer kostenpflichtigen Variante gelandet. Geh zurück und öffne **exakt** die Adresse oben mit `?sku=identitybasic`. *(Ob ganz ohne Kreditkarte — das sagt Google nirgends ausdrücklich; sehr wahrscheinlich ja, aber nicht 100 % belegt.)*

---

# Teil C — Deine Domain bei Google bestätigen

Google will einmal sehen, dass die Domain wirklich dir gehört. Das geht mit **einem kleinen Eintrag** bei Cloudflare.

**Adresse zum Öffnen:** **`https://admin.google.com`** (mit deinem **neuen** `admin@…`-Konto einloggen)

1. In der Admin-Konsole erscheint eine Aufforderung, die Domain zu **bestätigen** (oder: **Menü → Konto → Domains → Domains verwalten**).
2. Google zeigt dir einen langen Text-Wert, der mit **`google-site-verification=`** beginnt → **kopieren**.
   - [Quelle: Domain per TXT bestätigen](https://knowledge.workspace.google.com/admin/domains/verify-your-domain-with-a-txt-record)
3. Jetzt zu Cloudflare: **`https://dash.cloudflare.com`** → deine Test-Domain anklicken → links **„DNS"** → **„Eintrag hinzufügen"**:
   - **Typ:** `TXT`
   - **Name:** `@`
   - **Inhalt/Wert:** den kopierten `google-site-verification=…`-Text einfügen
   - **Speichern**
4. Zurück bei Google auf **„Bestätigen"** klicken.

> ⚠ **Wichtig:** Die sogenannten **MX-Einträge NICHT anfassen.** Die sind nur für E-Mail-Empfang, den brauchst du hier nicht.

✅ **Ergebnis:** Google weiß jetzt, dass die Domain dir gehört.

---

# Teil D — Gemini und NotebookLM einschalten

Neue Konten haben diese KI-Dienste noch nicht automatisch frei. Du schaltest sie **einmal für alle** frei.

**Adresse zum Öffnen:** **`https://admin.google.com`**

### Gemini
- **Menü → Generative AI → Gemini app**. Dort gibt es **zwei** Schalter:
  1. **Service status** → **„An für alle"** → Speichern.
  2. **User access** → Häkchen bei **„Allen Nutzern den Zugriff erlauben, unabhängig von der Lizenz"** → Speichern.
  - [Quelle](https://knowledge.workspace.google.com/admin/gemini/turn-the-gemini-app-on-or-off)

### NotebookLM
- **Menü → Generative AI → NotebookLM → Service status → „An für alle" → Speichern.**
  - [Quelle](https://knowledge.workspace.google.com/admin/users/access/turn-notebooklm-on-or-off-for-users)

> Beides kann **bis zu 24 Stunden** brauchen, bis es wirkt. Wenn der Test in Teil F nicht sofort klappt, am nächsten Tag nochmal probieren.

✅ **Ergebnis:** Gemini und NotebookLM sind für deine Konten freigeschaltet.

---

# Teil E — Ein Testkonto anlegen

**Adresse zum Öffnen:** **`https://admin.google.com`**

1. **Menü → Verzeichnis → Nutzer → „Neuen Nutzer hinzufügen".**
2. Vorname/Nachname + gewünschte Adresse eintragen, z. B. `test1@ki-workshop-test.com`.
3. Beim Passwort: das Häkchen **„Beim nächsten Login Passwort ändern" ENTFERNEN** (sonst nervt es beim Test).
4. **Anlegen.** Passwort notieren.

✅ **Ergebnis:** Dein erstes Wegwerf-Konto existiert.

---

# Teil F — Testkonto ausprobieren (der eigentliche Test)

> 💡 **Tipp:** Mach das in einem **neuen Inkognito-Fenster** (im Browser: Datei → Neues Inkognito-/Privatfenster), damit sich dein normaler Google-Login nicht mit dem Testkonto vermischt.

1. **`https://accounts.google.com`** öffnen → mit `test1@…` + Passwort einloggen.
   - 👀 **Beobachten:** Kommt ein **Begrüßungs-/Bedingungen-Bildschirm**, den man wegklicken muss?
2. **`https://gemini.google.com`** öffnen.
   - 👀 Funktioniert Gemini? Fragt es nach einem **Geburtsdatum**?
3. **`https://notebooklm.google.com`** öffnen.
   - 👀 Funktioniert NotebookLM?

✅ **Ergebnis:** Du weißt jetzt, ob ein Konto „aus dem Stand" mit den KI-Diensten funktioniert.

---

# Teil G — „Mit Google anmelden" bei den vier Diensten

Im selben Inkognito-Fenster (mit `test1@…` eingeloggt) je einmal ausprobieren:

| Dienst | Adresse | Aktion |
|---|---|---|
| Suno | `https://suno.com` | „Continue with Google" anklicken |
| Gamma | `https://gamma.app` | „Continue with Google" anklicken |
| ChatGPT | `https://chatgpt.com` | „Continue with Google" anklicken |
| Claude | `https://claude.ai` | „Continue with Google" anklicken |

- 👀 **Erwartung:** Login klappt überall.
- Falls eine Fehlermeldung wie **„access_denied"** kommt: in der Admin-Konsole unter **Sicherheit → Zugriffs- und Datenkontrolle → API-Steuerung → „Nicht konfigurierte Drittanbieter-Apps"** die Anmeldung erlauben ([Quelle](https://knowledge.workspace.google.com/admin/apps/control-which-apps-access-google-workspace-data)). Standard ist aber schon „erlaubt".

---

# Teil H — Mehrere Konten kurz hintereinander (Telefon-Abfrage?)

Hier geht es **nicht** um millisekundengenau gleichzeitig (das geht mit zehn Fingern eh nicht). Es reicht: **mehrere frische Konten in kurzer Zeit aus demselben WLAN** einloggen — denn genau so ein Muster macht Google manchmal misstrauisch.

1. Leg in Teil E noch **4 weitere** Konten an (`test2@…` bis `test5@…`).
2. Logge dich **zügig nacheinander** (innerhalb weniger Minuten) in alle 5 ein — aus deinem normalen WLAN. Praktisch:
   - pro Konto ein neues **Inkognito-Fenster** (oder zwischendurch ab- und wieder anmelden), **oder**
   - näher an „echt": mehrere **Geräte** nehmen (Laptop + Handy + Tablet) und auf jedem eines einloggen.
3. 👀 **Beobachten:** Kommt bei einem eine **Telefonnummer-Abfrage** oder „ungewöhnliche Anmeldung"?

- **Kommt nichts** → gutes Zeichen.
- **Ehrlich gesagt:** Der echte Stresstest sind erst die ~25 Logins im Workshop. Kommt schon bei 5 Stück nichts, ist das beruhigend — aber keine 100%-Garantie für 25. Wenn du es genauer wissen willst, mach vorher einen Mini-Probelauf mit 2–3 Kolleg:innen/Geräten.
- **Kommt eine Abfrage** → kein Drama; wir entzerren die Logins später zeitlich.

---

# Optional: Eigener Funktions-Check

```
Datum:  ____________
Domain: ____________

[ ] Begrüßungs-/Bedingungen-Bildschirm beim 1. Login?   ja / nein
[ ] Gemini funktioniert?                                 ja / nein  (Geburtsdatum gefragt? ja/nein)
[ ] NotebookLM funktioniert?                             ja / nein
[ ] Login bei Suno / Gamma / ChatGPT / Claude?           je: ja / nein
[ ] Telefon-Abfrage bei 5 gleichzeitigen Logins?         ja / nein
```

→ Funktionieren diese Punkte, ist deine Google-Einrichtung einsatzbereit.

---

# Aufräumen (damit es gratis bleibt)

- Testkonten nach dem Test löschen: **admin.google.com → Verzeichnis → Nutzer → Konto → Löschen.**
- Solange du unter **50 Konten gleichzeitig** bleibst, kostet es **nichts**.

---

# Anhang — Service Account & automatisiertes Anlegen (für Fortgeschrittene)

> **Optional.** Dieser Abschnitt richtet sich an alle, die das Anlegen/Löschen der Konten **automatisieren** möchten (der Dienst übernimmt das dann selbst). Einsteiger können ihn überspringen.

<details>
<summary>Service Account + Programmier-Zugang (später)</summary>

1. **Google-Cloud-Projekt:** `https://console.cloud.google.com/projectcreate` → Name → Erstellen ([Quelle](https://developers.google.com/workspace/guides/create-project)).
2. **Admin SDK API aktivieren:** APIs & Dienste → Bibliothek → „Admin SDK API" → Aktivieren ([Quelle](https://developers.google.com/workspace/guides/enable-apis)).
3. **Service Account + JSON-Schlüssel:** IAM & Verwaltung → Dienstkonten → erstellen → Tab „Schlüssel" → JSON herunterladen (sicher aufbewahren!) ([Quelle](https://cloud.google.com/iam/docs/keys-create-delete)).
4. **Domänenweite Delegierung:** Admin-Konsole → Sicherheit → Zugriffs- und Datenkontrolle → API-Steuerung → **Domänenweite Delegierung verwalten** → „Neu hinzufügen" → Client-ID + Scope `https://www.googleapis.com/auth/admin.directory.user` → Autorisieren ([Quelle](https://developers.google.com/workspace/admin/directory/v1/guides/delegation)).
5. **Konten per Programm:** `POST https://admin.googleapis.com/admin/directory/v1/users` (anlegen) / `DELETE …/users/{email}` (löschen) ([insert](https://developers.google.com/workspace/admin/directory/reference/rest/v1/users/insert), [delete](https://developers.google.com/workspace/admin/directory/reference/rest/v1/users/delete)).

</details>

---

## Alle Quellen

- Cloud Identity anmelden + Schritte: https://docs.cloud.google.com/identity/docs/how-to/set-up-cloud-identity-admin
- 50 gratis: https://docs.cloud.google.com/identity/docs/editions
- Domain per TXT bestätigen: https://knowledge.workspace.google.com/admin/domains/verify-your-domain-with-a-txt-record
- MX nur für E-Mail: https://knowledge.workspace.google.com/admin/domains/set-up-mx-records-for-google-workspace
- Drittanbieter-Apps erlauben: https://knowledge.workspace.google.com/admin/apps/control-which-apps-access-google-workspace-data
- Gemini ein/aus: https://knowledge.workspace.google.com/admin/gemini/turn-the-gemini-app-on-or-off
- NotebookLM ein/aus: https://knowledge.workspace.google.com/admin/users/access/turn-notebooklm-on-or-off-for-users

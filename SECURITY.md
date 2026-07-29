# Sicherheitslücken melden

Wenn du eine Sicherheitslücke in malzimail findest: **bitte nicht öffentlich als Issue posten.**

Melde sie vertraulich an: **info@malziland.at** (Betreff: „malzimail Security").

- Beschreibe das Problem so konkret wie möglich (betroffene Stelle, Schritte zum Nachstellen, mögliche Auswirkung).
- Du bekommst so schnell wie möglich eine Antwort — bitte gib uns angemessene Zeit zur Behebung, bevor du Details veröffentlichst (koordinierte Offenlegung).
- Es gibt kein Bug-Bounty-Programm, aber ehrliche Anerkennung im Changelog (wenn gewünscht).

## Geltungsbereich

- Code in diesem Repository (Worker, Admin, Teilnehmer-Seite, Google-Modul).
- NICHT in den Geltungsbereich fallen: Cloudflare- und Google-Plattformen selbst sowie fremde, selbst gehostete Instanzen — bei Letzteren wende dich an deren Betreiber.

## Grundsätze des Projekts

- Keine Geheimnisse im Repo; Schlüssel verschlüsselt (AES-GCM) oder als Worker-Secrets.
- Restriktive Security-Header (CSP, HSTS u. a.), HttpOnly/Secure-Cookies, gehashte Passwörter.
- Die ausgelieferten (Produktions-)Abhängigkeiten werden in der CI auf bekannte Schwachstellen geprüft (`npm audit --omit=dev --audit-level=high`); Build- und Test-Werkzeuge werden über Dependabot aktuell gehalten.
- **Installations-Skripte von Abhängigkeiten sind ausdrücklich freigegeben statt stillschweigend erlaubt** (`allowScripts` in `package.json`, npm-Mechanismus gegen Supply-Chain-Angriffe). Freigegeben sind genau drei Build-Werkzeuge, deren Skripte lediglich ihre plattformspezifische Binärdatei nachladen: `esbuild` (Bundler), `workerd` (Cloudflare-Workers-Laufzeit für die Tests) und `fsevents` (Dateiüberwachung unter macOS). Keines davon wird in den Worker ausgeliefert. Kommt eine weitere Abhängigkeit mit Installations-Skript hinzu, meldet npm sie als ungeprüft — sie muss dann bewusst freigegeben werden.

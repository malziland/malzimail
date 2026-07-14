# FLAGS — Register der Schalter

Grundsatz-Entscheidung des Projekts (11.06.2026): **Funktion folgt Konfiguration**
statt klassischer Feature-Flags. Es gibt bewusst keine Häkchen, die Verhalten
und Anzeige auseinanderdriften lassen können (Vorfall 13.06.2026). Neue riskante
Features bekommen trotzdem ein Flag nach diesem Register (Charta-Regel).

## Aktive Schalter (Konfiguration, keine Release-Flags)

| Schalter | Typ | Wirkung | Default | Owner |
|---|---|---|---|---|
| Google-Anbindung (`google_sa_key_enc`/`GOOGLE_SA_KEY`-Kette) | Konfiguration | Google-Konten werden angelegt, sobald gültige Zugangsdaten konfiguriert sind — dieselbe Bedingung steuert die „aktiv“-Anzeige im Admin | aus (keine Zugangsdaten) | Betreiber:in |
| `address_ttl_hours` (Settings → `ADDRESS_TTL_HOURS` → Default) | Konfiguration | maximale Lebensdauer von Adressen/Konten; speist auch die Rechtstexte | 48 h | Betreiber:in |
| „Workshop starten/stoppen“ | Kill-Switch (Betrieb) | Stopp macht den Teilnehmer-Link tot und wischt alle Daten — der Not-Aus der Instanz | gestoppt | Betreiber:in |

## Flag-Schulden (zu entfernen)

| Eintrag | Status | Entfernungs-Kriterium |
|---|---|---|
| `trainers.google_enabled` (DB-Feld) | Legacy, **kein Gate mehr** — `/api/address` ignoriert es. Nicht wieder als Schalter anschließen, ohne auch die Admin-Anzeige daran zu koppeln | mit der nächsten destruktiven Migration entfernen (Expand-Contract); Prüfung spätestens im nächsten LANGAUDIT |

## Regeln

- Jedes neue Flag kommt in dieses Register (Name, Typ, Zweck, Default, Owner,
  Entfernungs-Kriterium). Release-Flags starten **aus**; Kill-Switches starten
  im Normalbetriebs-Zustand.
- Berechtigungslogik ist kein Flag, sondern Autorisierung.
- Abgelaufene Flags gelten als Audit-Finding und blockieren das nächste Release.

// Admin / setup-assistant views (login, password, setup, Google modal, dashboard).
// Styling lives in public/shell.css (class-based) so the pages run under a strict
// CSP (style-src 'self'); interactive behaviour lives in public/admin.js.
import { htmlShell, escape } from './layout.js';

// ---------- Cockpit (Personal dashboard for the admin) ----------

export function renderAdminLogin({ error }) {
  const body = `
  <h1>Admin</h1>
  <p class="muted">Gib einmal das Passwort ein — danach bleibst du 30 Tage angemeldet.</p>
  <div class="card">
    <form method="POST" action="/admin">
      <label class="field-label">Passwort</label>
      <input type="password" name="password" autocomplete="current-password" required autofocus class="input">
      ${error ? `<p class="form-error">${escape(error)}</p>` : ''}
      <p class="form-actions">
        <button class="btn btn--primary" type="submit">
          Anmelden
        </button>
      </p>
    </form>
  </div>
  `;
  return htmlShell('Admin – Login', body);
}


// Setup assistant — Step 1: shown on first /admin visit when no admin password
// is configured anywhere (neither in settings nor as COCKPIT_PASSWORD secret).
export function renderSetupPassword({ error } = {}) {
  const body = `
  <h1>Dienst einrichten</h1>
  <p class="muted">Schritt 1 von 3 · Admin-Passwort</p>
  <div class="card">
    <form id="setupPwForm" method="POST" action="/admin">
      <input type="hidden" name="action" value="setup_password">
      <label class="field-label">Admin-Passwort (mind. 10 Zeichen)</label>
      <input type="password" name="password" autocomplete="new-password" required minlength="10" autofocus class="input input--mb">
      <label class="field-label">Passwort wiederholen</label>
      <input type="password" name="password2" autocomplete="new-password" required minlength="10" class="input">
      <p id="pw-mismatch" class="form-error pw-mismatch">Die beiden Passwörter stimmen nicht überein.</p>
      ${error ? `<p class="form-error">${escape(error)}</p>` : ''}
      <p class="form-actions">
        <button class="btn btn--primary" type="submit">
          Passwort festlegen
        </button>
      </p>
    </form>
    <p class="muted muted-note">Wird verschlüsselt (als Hash) in deiner Datenbank gespeichert — nirgends im Code.</p>
  </div>
  `;
  return htmlShell('Dienst einrichten', body, { script: '/admin.js' });
}

// Change-password form (reachable from the dashboard once logged in).
export function renderPasswordChange({ error, needsCurrent } = {}) {
  const body = `
  <h1>Passwort ändern</h1>
  <div class="card">
    <form method="POST" action="/admin/password">
      ${needsCurrent ? `
      <label class="field-label">Aktuelles Passwort</label>
      <input type="password" name="current" autocomplete="current-password" required class="input input--mb">` : ''}
      <label class="field-label">Neues Passwort (mind. 10 Zeichen)</label>
      <input type="password" name="password" autocomplete="new-password" required minlength="10" autofocus class="input input--mb">
      <label class="field-label">Neues Passwort wiederholen</label>
      <input type="password" name="password2" autocomplete="new-password" required minlength="10" class="input">
      ${error ? `<p class="form-error">${escape(error)}</p>` : ''}
      <p class="form-actions--row">
        <button class="btn btn--primary" type="submit">
          Speichern
        </button>
        <a href="/admin" class="link-muted">Abbrechen</a>
      </p>
    </form>
  </div>
  `;
  return htmlShell('Passwort ändern', body);
}

// Google config as a modal overlaying the admin dashboard (no standalone page).
// The form posts to /admin; a successful save redirects back (modal closed); a test
// or error re-renders the dashboard with modalOpen=true so the modal reappears.
export function renderGoogleModal({ source = 'none', subject = '', domain = '', hasKey = false, modalTest, formError, modalOpen = false } = {}) {
  const configured = source !== 'none';
  const resultBox = (t) => !t ? '' : (t.ok
    ? `<div class="card result-ok"><p class="result-ok__text">✓ Verbindung erfolgreich — die Zugangsdaten funktionieren.</p></div>`
    : `<div class="card result-bad"><p class="result-bad__text">✗ Verbindung fehlgeschlagen${t.step ? ' (' + escape(t.step) + ')' : ''}${t.status ? ' · HTTP ' + escape(String(t.status)) : ''}.</p><p class="muted result-detail">${escape((t.detail || 'Keine Details.').slice(0, 300))}</p></div>`);
  const statusLine = configured
    ? '<p class="gstatus-ok">✓ Google ist eingerichtet</p>'
    : '<p class="gstatus-bad">✗ Noch nicht eingerichtet</p>';

  return `
  <div id="gModal" data-modal-backdrop class="modal-overlay${modalOpen ? ' is-open' : ''}">
    <div class="modal-card">
      <h2 class="modal-title">Google-Konfiguration</h2>
      ${statusLine}
      <p class="muted modal-intro">Hier änderst du die Google-Zugangsdaten (bei der Einrichtung festgelegt). Reine Zugangsdaten — es wird nie eine E-Mail verschickt; der Schlüssel wird verschlüsselt gespeichert.</p>
      ${formError ? `<div class="card alert-danger"><p class="alert-danger__text">${escape(formError)}</p></div>` : ''}
      <form method="POST" action="/admin">
        <label class="field-label--tight">Google-Admin-Konto</label>
        <p class="muted field-hint">Das Super-Admin-Konto deines Google-Bereichs (z. B. <code>admin@id.deine-domain.at</code>), in dessen Namen die Konten angelegt werden. <em>Kein</em> Mail-Betreff.</p>
        <input type="text" name="subject" value="${escape(subject)}" placeholder="admin@id.deine-domain.at" class="input input--mb14">
        <label class="field-label--tight">Konto-Domain</label>
        <p class="muted field-hint">Die Domain, auf der die Wegwerf-Google-Konten entstehen (z. B. <code>deine-domain.at</code>).</p>
        <input type="text" name="domain" value="${escape(domain)}" placeholder="deine-domain.at" class="input input--mb14">
        <label class="field-label--tight">Service-Account-Schlüssel (JSON)</label>
        <p class="muted field-hint">${hasKey
          ? 'Der gespeicherte Schlüssel wird aus Sicherheitsgründen <strong>nie angezeigt</strong> — leer lassen, um ihn zu <strong>behalten</strong>, oder neuen JSON einfügen, um ihn zu <strong>ersetzen</strong>.'
          : 'Füge hier den kompletten JSON-Schlüssel des Service-Accounts ein.'}</p>
        <textarea name="sa_key" rows="5" placeholder="{ &quot;type&quot;: &quot;service_account&quot;, … }" class="input input--mono"></textarea>
        ${resultBox(modalTest)}
        <div class="modal-actions">
          <button class="btn btn--accent" type="submit" name="action" value="test_google_form">Verbindung testen</button>
          <span class="btn-group">
            <button class="btn btn--ghost" type="button" data-action="close-modal" data-target="gModal">Abbrechen</button>
            <button class="btn btn--primary" type="submit" name="action" value="save_google">Speichern</button>
          </span>
        </div>
      </form>
    </div>
  </div>`;
}

// Setup assistant — Step 2: operator/business data (feeds Impressum etc.).
export function renderSetupOperator({ values = {}, error } = {}) {
  const v = (k) => escape(values[k] || '');
  const field = (name, label, ph = '', req = true) => `
    <label class="field-label--muted">${label}</label>
    <input type="text" name="${name}" value="${v(name)}" placeholder="${ph}" ${req ? 'required' : ''} class="input input--sm input--mb">`;
  const body = `
  <h1>Dienst einrichten</h1>
  <p class="muted">Schritt 2 von 3 · Deine Daten (alle Felder erforderlich)</p>
  <div class="card setup-info">
    <p class="setup-info__title">Wozu diese Daten?</p>
    <p class="setup-info__text">Aus deinen Angaben erstellt malziMAIL automatisch dein <strong>Impressum, deine Datenschutzerklärung, die Nutzungsbedingungen und den Footer</strong> — mehr passiert damit nicht.</p>
    <p class="setup-info__text">Die Daten werden <strong>nicht an Dritte übermittelt</strong> und nicht ausgewertet. Sie bleiben in deiner eigenen Instanz; niemand von außen hat jemals Zugriff darauf.</p>
  </div>
  <div class="card">
    <form method="POST" action="/admin">
      <input type="hidden" name="action" value="setup_operator">
      ${field('service_name', 'Name des Dienstes', 'z.B. workshopmail')}
      ${field('owner', 'Name (Inhaber:in / verantwortliche Person)', 'Vor- und Nachname')}
      ${field('company', 'Firma / Unternehmensname (optional)', 'z.B. Beispiel GmbH', false)}
      ${field('street', 'Straße und Hausnummer', 'z.B. Musterweg 1')}
      <div class="row-12">
        <div class="col-zip">${field('zip', 'PLZ', 'z.B. 4020')}</div>
        <div class="col-grow">${field('city', 'Ort', 'z.B. Linz')}</div>
      </div>
      ${field('email', 'Kontakt-E-Mail', 'office@deine-domain.at')}
      ${error ? `<p class="form-error--tight">${escape(error)}</p>` : ''}
      <p class="form-actions--sm">
        <button class="btn btn--primary" type="submit">
          Weiter
        </button>
      </p>
    </form>
  </div>
  `;
  return htmlShell('Dienst einrichten', body, { script: '/admin.js' });
}

// Setup assistant — Step 3 (MANDATORY): the Google access for the disposable logins.
// There is no service without Google, so the setup only completes once the connection
// test succeeds (hard stop). The credentials can later be changed via the admin modal.
export function renderSetupGoogle({ values = {}, error } = {}) {
  const v = (k) => escape(values[k] || '');
  const body = `
  <h1>Dienst einrichten</h1>
  <p class="muted">Schritt 3 von 3 · Google-Zugang (für die Wegwerf-Logins)</p>
  <div class="card">
    <p class="muted modal-intro">malziMAIL legt für jede:n Teilnehmer:in automatisch einen Wegwerf-Google-Login an (Gemini, NotebookLM, „Mit Google anmelden"). Dafür brauchst du einmalig den Zugang deines Google-Bereichs.</p>
    ${error ? `<div class="card alert-danger"><p class="alert-danger__text">${escape(error)}</p></div>` : ''}
    <form method="POST" action="/admin">
      <input type="hidden" name="action" value="setup_google">
      <label class="field-label--tight">Google-Admin-Konto</label>
      <p class="muted field-hint">Das Super-Admin-Konto deines Google-Bereichs (z. B. <code>admin@id.deine-domain.at</code>).</p>
      <input type="text" name="subject" value="${v('subject')}" placeholder="admin@id.deine-domain.at" class="input input--mb14">
      <label class="field-label--tight">Konto-Domain</label>
      <p class="muted field-hint">Die Domain, auf der die Wegwerf-Google-Konten entstehen (z. B. <code>deine-domain.at</code>).</p>
      <input type="text" name="domain" value="${v('domain')}" placeholder="deine-domain.at" class="input input--mb14">
      <label class="field-label--tight">Service-Account-Schlüssel (JSON)</label>
      <p class="muted field-hint">Die JSON-Schlüsseldatei, die du bei Google heruntergeladen hast (Dateiname endet auf <code>.json</code>). <strong>Zwei Wege:</strong> die Datei in das Feld unten ziehen <em>oder</em> das Feld anklicken und sie auswählen — alternativ den JSON-Inhalt ganz unten als Text einfügen. Der Schlüssel wird verschlüsselt gespeichert.</p>
      <label id="sa-drop" for="sa-file" class="drop-zone">
        <input type="file" id="sa-file" accept="application/json,.json" class="drop-zone__input">
        <span class="drop-zone__icon" aria-hidden="true">⬆</span>
        <span id="sa-drop-text" class="drop-zone__text">JSON-Datei hierher ziehen oder klicken zum Auswählen</span>
      </label>
      <label class="field-label--muted drop-or">… oder den JSON-Text direkt einfügen:</label>
      <textarea name="sa_key" id="sa-key" rows="5" placeholder="{ &quot;type&quot;: &quot;service_account&quot;, … }" class="input input--mono"></textarea>
      <p class="form-actions">
        <button class="btn btn--primary" type="submit">
          Verbindung testen &amp; Einrichtung abschließen
        </button>
      </p>
    </form>
    <p class="muted muted-note">Die Einrichtung wird erst abgeschlossen, wenn die Verbindung zu Google erfolgreich getestet wurde.</p>
  </div>
  `;
  return htmlShell('Dienst einrichten', body, { script: '/admin.js' });
}

// System-Check cell values (inner HTML per <dd>). Single source of truth shared by
// the dashboard's initial render AND the live background poll (src/routes/admin.js
// fragment → public/admin.js), so both can never drift apart.
export function systemCheckCells(selfCheck = {}) {
  const ok = '<span class="gdot gdot--ok">● ok</span>';
  return {
    maildomain: selfCheck.mailDomainSet ? ok : '<span class="gdot gdot--bad">● fehlt — Adressen können nicht erzeugt werden</span>',
    enckey: selfCheck.encKeySet ? ok : '<span class="gdot gdot--bad">● fehlt — Mails würden UNVERSCHLÜSSELT gespeichert</span>',
    db: `${ok} <span class="muted">erreichbar</span>`,
    lastmail: selfCheck.lastMailAt
      ? `${ok} <span class="muted">(zuletzt ${escape(new Date(selfCheck.lastMailAt).toISOString().slice(0, 16).replace('T', ' '))} UTC)</span>`
      : '<span class="muted">noch keine E-Mail empfangen</span>',
  };
}

// Single-workshop admin (admin = trainer). One button starts a fresh rotating
// link, one stops it (and wipes everything). No fixed runtime, no token input.
export function renderWorkshopDashboard({ workshop, serviceName, googleActive, googleTestedOk = null, googleStats = { active: 0, limit: 50, free: 50 }, google = {}, selfCheck = {}, now, origin, flash }) {
  const sn = escape(serviceName || 'malziMAIL');
  const flashHtml = flash ? `<div class="card alert-accent"><p class="alert-accent__text">${escape(flash)}</p></div>` : '';

  const active = !!(workshop && workshop.enabled && workshop.active_until > now);

  // Status box — no countdown (the workshop runs until it is stopped).
  const statusBox = active
    ? `<div class="card statusbox is-ok">
        <p class="statusbox__title">✓ Workshop läuft</p></div>`
    : `<div class="card statusbox is-idle">
        <p class="statusbox__title">⏸ Kein Workshop aktiv <span class="statusbox__note">· starte einen, um einen Teilnehmer-Link zu erhalten</span></p></div>`;

  // Compact Google-accounts counter (replaces the old stats line) — only when Google
  // is configured. The polling script (admin.js) keeps it live as participants join.
  const googleCounter = googleActive ? `
    <div class="gcounter"
         title="Richtwert: zählt die von diesem Dienst angelegten Konten. Das Google-Admin-Konto und evtl. Reste zählen bei Google zusätzlich.">
      <span class="muted">Google-Konten aktiv</span>
      <span><strong id="g-active" class="gcounter__active">${googleStats.active}</strong><span class="muted"> von ${googleStats.limit} · noch </span><strong id="g-free" class="gcounter__free">${googleStats.free}</strong><span class="muted"> frei</span></span>
    </div>` : '';

  let workshopCard;
  let stopModal = '';
  let qrModal = '';
  if (active) {
    const workshopUrl = `${origin}/?t=${encodeURIComponent(workshop.token)}`;
    const qrUrl = `${origin}/api/qr?text=${encodeURIComponent(workshopUrl)}`;
    workshopCard = `
    <div class="card mb-14">
      <div class="ws-head mb-14">
        <h2 class="h2">Workshop</h2>
        <button type="button" data-action="open-modal" data-target="stopModal" class="ws-btn ws-btn--stop">⏹ Workshop stoppen</button>
      </div>
      <div class="ws-linksec">
        <p class="muted label-sm">Teilnehmer-Link</p>
        <div class="link-row">
          <input readonly value="${escape(workshopUrl)}" class="link-input">
          <button type="button" data-action="copy" class="chip-btn chip-btn--default">Kopieren</button>
          <button type="button" data-action="open-modal" data-target="qrModal" class="chip-btn chip-btn--accent">QR-Code</button>
        </div>
      </div>
      ${googleCounter}
    </div>`;
    stopModal = `
    <div id="stopModal" data-modal-backdrop class="modal-overlay">
      <div class="modal-card modal-card--sm">
        <div class="modal-warnhead">
          <span class="emoji-lg">⚠️</span>
          <h2 class="modal-title--warn">Workshop stoppen?</h2>
        </div>
        <p class="modal-text">Der Workshop wird beendet: <strong>alle Google-Konten werden gelöscht</strong>, alle Teilnehmer-Sitzungen zurückgesetzt (Postfächer geleert) und der <strong>Teilnehmer-Link wird ungültig</strong>. Lässt sich nicht rückgängig machen.</p>
        <div id="stopActions" class="modal-actions--end">
          <button type="button" data-action="close-modal" data-target="stopModal" class="modal-btn">Abbrechen</button>
          <button type="button" data-action="stop" class="modal-btn--confirm-warn">Ja, Workshop stoppen</button>
        </div>
        <div id="stopSpinner" class="stop-spinner">
          <span class="spin" aria-hidden="true"></span> Workshop wird gestoppt … das Fenster schließt sich automatisch.
        </div>
      </div>
    </div>`;
    qrModal = `
    <div id="qrModal" data-modal-backdrop class="modal-overlay">
      <div class="modal-card modal-card--qr">
        <img src="${escape(qrUrl)}" alt="QR-Code zum Workshop-Link" class="qr-img">
        <p class="muted qr-cap">${escape(workshopUrl)}</p>
        <button type="button" data-action="close-modal" data-target="qrModal" class="qr-close">Schließen</button>
      </div>
    </div>`;
  } else {
    workshopCard = `
    <div class="card mb-14">
      <div class="ws-head">
        <div>
          <h2 class="h2--mb4">Workshop starten</h2>
          <p class="muted p-tight">Erzeugt einen frischen Teilnehmer-Link (gilt bis du stoppst).</p>
        </div>
        <form method="POST" action="/admin" class="inline-form">
          <input type="hidden" name="action" value="activate">
          <button type="submit" class="ws-btn ws-btn--start">▶ Workshop starten</button>
        </form>
      </div>
      ${googleCounter}
    </div>`;
  }

  const googleConfigButton = `
  <button type="button" data-action="open-modal" data-target="gModal" class="card gconfig-btn">
    <span class="gconfig-btn__label">Google-Konfiguration</span>
    <span class="gconfig-status">
      ${!googleActive
        ? '<span class="gdot gdot--bad">● nicht eingerichtet</span> <span class="gdot gdot--accent">Jetzt einrichten</span>'
        : googleTestedOk === true
          ? '<span class="gdot gdot--ok">● verbunden</span>'
          : googleTestedOk === false
            ? '<span class="gdot gdot--warn">● Verbindung fehlgeschlagen</span>'
            : '<span class="gdot gdot--ok">● eingerichtet</span>'}
      <span class="gchevron">›</span>
    </span>
  </button>`;

  // System-Check — the mail/config counterpart to Google's "Verbindung testen":
  // gives a (self-hosting) operator at-a-glance proof that the basics are in place.
  // The cells carry stable ids so admin.js can refresh them live (background poll).
  const sc = systemCheckCells(selfCheck);
  const systemCheck = `
  <div class="card mb-14">
    <h2 class="h2--mb4">System-Check</h2>
    <dl class="kvp">
      <dt>Mail-Domain</dt><dd id="sc-maildomain">${sc.maildomain}</dd>
      <dt>Verschlüsselung</dt><dd id="sc-enckey">${sc.enckey}</dd>
      <dt>Datenbank</dt><dd id="sc-db">${sc.db}</dd>
      <dt>Mail-Empfang</dt><dd id="sc-lastmail">${sc.lastmail}</dd>
    </dl>
  </div>`;

  const body = `
  ${flashHtml}
  ${statusBox}
  ${workshopCard}
  ${googleConfigButton}
  ${systemCheck}
  ${renderGoogleModal(google)}

  <p class="admin-links">
    <a href="/admin/password" class="link-accent">Passwort ändern</a>
    <a href="/admin/logout" class="link-muted">Abmelden</a>
  </p>
  ${stopModal}
  ${qrModal}
  `;
  return htmlShell('Admin – ' + sn, body, { script: '/admin.js' });
}

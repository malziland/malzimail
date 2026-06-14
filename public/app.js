// malziMAIL participant SPA — externalized from app.html so the page can run
// under a strict Content-Security-Policy (script-src 'self', no 'unsafe-inline').
const ADDRESS_STORAGE_KEY = 'malzimail.address';
const TOKEN_STORAGE_KEY = 'malzimail.token';
const VERSION_STORAGE_KEY = 'malzimail.appver';
// Bump on any deploy where a stored address could be stale (e.g. an address
// created before Google was available). On version change the page drops the
// remembered address/Google login so the participant gets a fresh one — makes
// browser-side state (the real "cache") irrelevant across deploys.
const APP_VERSION = '2026-06-13-reset';
const POLL_INTERVAL_MS = 5000;
// While the workshop is not active yet, retry quietly so the page recovers
// on its own once the trainer starts it (no manual reload needed).
const RETRY_INTERVAL_MS = 12000;

const els = {
  address: document.getElementById('address'),
  addressHelp: document.getElementById('address-help'),
  copy: document.getElementById('copy'),
  expiresInfo: document.getElementById('expires-info'),
  messages: document.getElementById('messages'),
  empty: document.getElementById('empty'),
  inboxStatus: document.getElementById('inbox-status'),
  workshopPill: document.getElementById('workshop-pill'),
  toast: document.getElementById('toast'),
  detail: document.getElementById('detail'),
  detailSubject: document.getElementById('detail-subject'),
  detailMeta: document.getElementById('detail-meta'),
  detailBody: document.getElementById('detail-body'),
  detailClose: document.getElementById('detail-close'),
  stepMain: document.getElementById('step-main'),
  mainBadge: document.getElementById('main-badge'),
  badgeGoogle: document.getElementById('badge-google'),
  badgeMail: document.getElementById('badge-mail'),
  mainTitle: document.getElementById('main-title'),
  googleBlock: document.getElementById('google-block'),
  mailBlock: document.getElementById('mail-block'),
  googleMsg: document.getElementById('google-msg'),
  googleLogin: document.getElementById('google-login'),
  googlePass: document.getElementById('google-pass'),
  googleLoginCopy: document.getElementById('google-login-copy'),
  googlePassCopy: document.getElementById('google-pass-copy'),
  resetNotice: document.getElementById('reset-notice'),
  resetTitle: document.getElementById('reset-title'),
  resetText: document.getElementById('reset-text'),
  resetReload: document.getElementById('reset-reload')
};
const GOOGLE_STORAGE_KEY = 'malzimail.google';

let currentAddress = null;
let currentExpiresAt = null;
let currentToken = null;
let pollTimer = null;
let expiresTimer = null;
let retryTimer = null;

init();

async function init() {
  // Drop a stored address/Google login left over from an older app version
  // (e.g. an address created before Google was available) so it can't get stuck.
  if (safeLocalGet(VERSION_STORAGE_KEY) !== APP_VERSION) {
    safeLocalRemove(ADDRESS_STORAGE_KEY);
    safeLocalRemove(GOOGLE_STORAGE_KEY);
    safeLocalSet(VERSION_STORAGE_KEY, APP_VERSION);
  }

  els.copy.addEventListener('click', onCopy);
  els.googleLoginCopy.addEventListener('click', () => copyText(els.googleLogin.value, 'E-Mail kopiert.'));
  els.googlePassCopy.addEventListener('click', () => copyText(els.googlePass.value, 'Passwort kopiert.'));
  els.detailClose.addEventListener('click', () => els.detail.close());
  els.resetReload.addEventListener('click', restartSession);
  // Modal closes only via its × button: block backdrop-click and the native <dialog> ESC ('cancel').
  els.detail.addEventListener('cancel', (e) => e.preventDefault());

  // Token: from URL takes precedence over localStorage (so a fresh trainer link always wins)
  const urlToken = (new URL(location.href).searchParams.get('t') || '').trim().toLowerCase();
  if (urlToken) {
    currentToken = urlToken;
    safeLocalSet(TOKEN_STORAGE_KEY, urlToken);
    // Clean URL so the token isn't kept in history/bookmarks unnecessarily
    history.replaceState({}, '', location.pathname);
  } else {
    currentToken = safeLocalGet(TOKEN_STORAGE_KEY);
  }

  if (!currentToken) {
    showNoTokenState();
    return;
  }

  if (els.workshopPill) els.workshopPill.hidden = false;

  const stored = safeLocalGet(ADDRESS_STORAGE_KEY);
  if (stored) {
    await loadStoredAddress(stored);
  } else {
    await onNewAddress();
  }
}

function showNoTokenState() {
  setHelp('Du brauchst einen aktuellen Trainer-Link, um eine Adresse zu erzeugen. Bitte frage deine Trainerin oder deinen Trainer.');
  els.address.placeholder = 'Kein aktiver Workshop-Link';
  els.address.value = '';
  els.copy.disabled = true;
  els.expiresInfo.textContent = 'Kein aktiver Workshop';
  els.expiresInfo.classList.remove('is-warn');
  els.expiresInfo.classList.add('is-danger');
  els.empty.hidden = false;
  els.messages.hidden = true;
}

async function loadStoredAddress(address) {
  try {
    const res = await fetch('/api/address/status?to=' + encodeURIComponent(address));
    if (!res.ok) { safeLocalRemove(ADDRESS_STORAGE_KEY); await onNewAddress(); return; }
    const data = await res.json();
    if (!data.active) {
      // Stored address is past its 24h lifetime — fetch a fresh one automatically
      // instead of dead-ending. If the workshop isn't active yet, onNewAddress
      // shows the inactive notice and keeps retrying in the background.
      safeLocalRemove(ADDRESS_STORAGE_KEY);
      hideGoogle();
      currentAddress = null; currentExpiresAt = null;
      await onNewAddress();
      return;
    }
    setAddressUI(address, data.expires_at);
    restoreGoogle();
    startPolling();
    refreshMessages();
  } catch (err) {
    safeLocalRemove(ADDRESS_STORAGE_KEY);
    await onNewAddress();
  }
}

// Obtain the participant's address. Called automatically on page open and as a
// quiet background retry while the workshop is not active yet — there is no
// manual "new address" button (participants must not be able to regenerate /
// self-extend their address; duration is the trainer's call).
async function onNewAddress(silent) {
  if (!currentToken) { showNoTokenState(); return; }
  if (!silent) setHelp('Erzeuge neue Adresse …');
  try {
    const res = await fetch('/api/address', {
      method: 'POST',
      headers: { 'x-trainer-token': currentToken }
    });
    if (res.status === 401 || res.status === 403) {
      const data = await safeJson(res);
      handleAuthError(data && data.error);
      return;
    }
    if (res.status === 429) {
      const data = await safeJson(res);
      handleQuotaError(data && data.error, data && data.limit);
      return;
    }
    if (!res.ok) throw new Error('Server-Fehler');
    const data = await res.json();
    stopInactiveRetry();   // got an address — no need to keep retrying
    setAddressUI(data.address, data.expires_at);
    safeLocalSet(ADDRESS_STORAGE_KEY, data.address);
    if (data.google && data.google.login) {
      showGoogle(data.google.login, data.google.password);
    } else if (data.google_status === 'limit') {
      showGoogleNotice('Gerade sind alle Google-Logins vergeben (Konto-Limit erreicht). Deine Mail-Adresse oben funktioniert – bitte sag deiner Trainerin oder deinem Trainer Bescheid.');
    } else if (data.google_status === 'error') {
      showGoogleNotice('Der Google-Login lässt sich gerade nicht erstellen. Deine Mail-Adresse oben funktioniert – bitte sag deiner Trainerin oder deinem Trainer Bescheid.');
    } else {
      hideGoogle();
    }
    startPolling();
    refreshMessages();
  } catch (err) {
    if (!silent) setHelp('Fehler: ' + err.message);
  }
}

function handleAuthError(code) {
  if (code === 'workshop_inactive') {
    setHelp('Dieser Workshop ist gerade nicht aktiv. Sobald deine Trainerin oder dein Trainer ihn startet, erscheint deine Adresse hier automatisch.');
    setBigError('Workshop nicht aktiv');
    startInactiveRetry();   // recover on its own once the workshop is started
  } else if (code === 'invalid_token') {
    stopInactiveRetry();
    setHelp('Dein Trainer-Link ist nicht (mehr) gültig. Bitte einen aktuellen Link von deiner Trainerin oder deinem Trainer holen.');
    setBigError('Ungültiger Link');
    safeLocalRemove(TOKEN_STORAGE_KEY);
  } else {
    stopInactiveRetry();
    setHelp('Kein gültiger Trainer-Link. Bitte öffne den Link, den du von deiner Trainerin oder deinem Trainer bekommen hast.');
    setBigError('Kein Zugang');
  }
  els.copy.disabled = true;
}

function handleQuotaError(code, limit) {
  if (code === 'quota_reached') {
    setHelp('Das Tageskontingent für diesen Workshop ist erreicht' + (limit ? ' (' + limit + ' Adressen)' : '') + '. Bitte morgen wieder versuchen oder Trainer:in kontaktieren.');
  } else if (code === 'bot_limit_reached') {
    setHelp('Dieser Workshop hat heute die maximale Anzahl Adress-Anfragen erreicht. Bitte morgen wieder versuchen.');
  } else {
    setHelp('Limit erreicht. Bitte morgen wieder versuchen.');
  }
  setBigError('Limit erreicht');
}

function setBigError(label) {
  els.expiresInfo.textContent = label;
  els.expiresInfo.classList.remove('is-warn');
  els.expiresInfo.classList.add('is-danger');
}

async function safeJson(res) {
  try { return await res.json(); } catch (e) { return null; }
}

function setAddressUI(address, expiresAt) {
  currentAddress = address;
  currentExpiresAt = expiresAt;
  // We have a working address again — make sure the controls are usable, even if
  // they were disabled earlier by an inactive-workshop / error state.
  els.copy.disabled = false;
  els.address.value = address;
  setHelp('Das ist deine persönliche temporäre Mail-Adresse für die nächsten Stunden.');
  els.messages.innerHTML = '';
  els.messages.hidden = true;
  els.empty.hidden = false;
  updateExpiresLabel();
  startExpiresTicker();
}

// One card, two faces. With a Google login the card becomes "Mit Google anmelden"
// (E-Mail = the login + password); without one it's "Deine Mail-Adresse" (the address).
// It is the SAME address either way — so we never show two separate cards for it.
const MAIL_HELP = 'Das ist deine persönliche temporäre Mail-Adresse für die nächsten Stunden.';

function setGoogleMode() {
  els.stepMain.className = 'step step--google';
  els.mainBadge.className = 'step__badge badge--accent';
  els.badgeGoogle.hidden = false;
  els.badgeMail.style.display = 'none'; // SVG: .hidden doesn't reflect on SVG elements
  els.mainTitle.textContent = 'Mit Google anmelden';
  setHelp('Für Gemini, NotebookLM oder „Mit Google anmelden". Gib bei Google diese zwei Dinge ein — der Posteingang darunter zeigt eingehende Mails (z. B. Bestätigungen) automatisch an:');
  els.googleBlock.hidden = false;
  els.mailBlock.hidden = true;
}

function setMailMode() {
  els.stepMain.className = 'step step--mail';
  els.mainBadge.className = 'step__badge badge--primary';
  els.badgeGoogle.hidden = true;
  els.badgeMail.style.display = ''; // SVG: revert to stylesheet display
  els.mainTitle.textContent = 'Deine Mail-Adresse';
  els.googleBlock.hidden = true;
  els.mailBlock.hidden = false;
}

function showGoogle(login, password) {
  if (!login || !password) return;
  els.googleLogin.value = login;   // == the address; shown as the explicit "E-Mail" to type into Google
  els.googlePass.value = password;
  els.googleMsg.hidden = true;
  setGoogleMode();
  safeLocalSet(GOOGLE_STORAGE_KEY, JSON.stringify({ login, password }));
}

function showGoogleNotice(text) {
  // Google is configured but no login could be issued — fall back to the plain mail
  // view (the address still works) and explain why the Google login is missing.
  setMailMode();
  setHelp(MAIL_HELP);
  els.googleMsg.textContent = text;
  els.googleMsg.hidden = false;
  safeLocalRemove(GOOGLE_STORAGE_KEY);
}

function hideGoogle() {
  setMailMode();
  setHelp(MAIL_HELP);
  els.googleMsg.hidden = true;
  els.googleLogin.value = '';
  els.googlePass.value = '';
  safeLocalRemove(GOOGLE_STORAGE_KEY);
}

function restoreGoogle() {
  const raw = safeLocalGet(GOOGLE_STORAGE_KEY);
  if (!raw) return;
  try {
    const g = JSON.parse(raw);
    if (g && g.login && g.password) showGoogle(g.login, g.password);
  } catch (e) { /* ignore */ }
}

function copyText(text, okMsg) {
  if (!text) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(() => toast(okMsg), () => {});
  }
}

function onCopy() {
  if (!currentAddress) return;
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(currentAddress).then(
      () => toast('Adresse in die Zwischenablage kopiert.'),
      () => fallbackCopy()
    );
  } else fallbackCopy();
}
function fallbackCopy() {
  els.address.select();
  try { document.execCommand('copy'); toast('Adresse kopiert.'); }
  catch (e) { toast('Kopieren fehlgeschlagen – bitte manuell markieren.'); }
}

function startPolling() {
  if (pollTimer) clearInterval(pollTimer);
  if (document.hidden) return;
  pollTimer = setInterval(refreshMessages, POLL_INTERVAL_MS);
}

// Quietly retry getting an address while the workshop is not active yet, so the
// participant page wakes up on its own once the trainer starts the workshop.
function startInactiveRetry() {
  if (retryTimer) return;            // already retrying
  retryTimer = setInterval(() => {
    if (document.hidden || currentAddress || !currentToken) return;
    onNewAddress(true);       // silent background attempt
  }, RETRY_INTERVAL_MS);
}
function stopInactiveRetry() {
  if (retryTimer) { clearInterval(retryTimer); retryTimer = null; }
}

document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  } else if (currentAddress && currentToken) {
    refreshMessages();
    startPolling();
  } else if (retryTimer && currentToken) {
    onNewAddress(true);   // try right away instead of waiting for the next tick
  }
});

async function refreshMessages() {
  if (!currentAddress) return;
  try {
    const res = await fetch('/api/messages?to=' + encodeURIComponent(currentAddress), {
      headers: { 'x-trainer-token': currentToken }
    });
    if (res.status === 410) {
      const data = await safeJson(res);
      if (data && data.error === 'reset') {
        // The trainer stopped the workshop -> cut off immediately: drop the stored
        // identity and send the participant back to the start page (no mail access).
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        safeLocalRemove(ADDRESS_STORAGE_KEY);
        safeLocalRemove(GOOGLE_STORAGE_KEY);
        safeLocalRemove(TOKEN_STORAGE_KEY);
        location.href = '/';
      } else {
        markExpired();
      }
      return;
    }
    if (!res.ok) return;
    const data = await res.json();
    renderMessages(data.messages || []);
    if (data.expires_at) { currentExpiresAt = data.expires_at; updateExpiresLabel(); }
  } catch (err) { /* network blip */ }
}

function renderMessages(messages) {
  // The pulsing status line stays visible (live feel) — only its wording changes.
  if (!messages.length) {
    els.inboxStatus.textContent = 'Noch keine Nachrichten. Sobald eine Mail eintrifft, siehst du sie hier.';
    els.messages.hidden = true;
    els.messages.innerHTML = '';
    return;
  }
  els.inboxStatus.textContent = 'Aktualisiert sich laufend – neue Mails erscheinen automatisch hier.';
  els.messages.hidden = false;
  const fragment = document.createDocumentFragment();
  for (const m of messages) {
    const li = document.createElement('li');
    li.dataset.id = m.id;
    const main = document.createElement('div');
    const fromEl = document.createElement('div');
    fromEl.className = 'msg-from'; fromEl.textContent = m.from_addr || '(unbekannt)';
    const subjEl = document.createElement('div');
    subjEl.className = 'msg-subject'; subjEl.textContent = m.subject || '(kein Betreff)';
    main.append(fromEl, subjEl);
    const timeEl = document.createElement('div');
    timeEl.className = 'msg-time'; timeEl.textContent = formatTime(m.received_at);
    li.append(main, timeEl);
    li.addEventListener('click', () => openMessage(m.id));
    fragment.appendChild(li);
  }
  els.messages.innerHTML = '';
  els.messages.appendChild(fragment);
}

async function openMessage(id) {
  try {
    const res = await fetch('/api/message/' + id + '?to=' + encodeURIComponent(currentAddress), {
      headers: { 'x-trainer-token': currentToken }
    });
    if (res.status === 410) { markExpired(); return; }
    if (!res.ok) { toast('Nachricht konnte nicht geladen werden.'); return; }
    const m = await res.json();
    showDetail(m, id);
  } catch (err) { toast('Fehler beim Laden.'); }
}

function showDetail(m, id) {
  els.detailSubject.textContent = m.subject || '(kein Betreff)';
  els.detailMeta.textContent = 'Von: ' + (m.from_addr || '(unbekannt)') + ' · ' + formatTime(m.received_at);
  els.detailBody.innerHTML = '';
  if (m.html_body) {
    // Load the mail HTML from its own isolated endpoint (own scoped CSP), NOT srcdoc:
    // a srcdoc document inherits this page's strict CSP and would strip the mail's
    // inline styles. The endpoint blocks scripts and external loads; the sandbox here
    // is belt-and-suspenders (the response CSP also sandboxes).
    const iframe = document.createElement('iframe');
    iframe.sandbox = 'allow-popups allow-popups-to-escape-sandbox';
    iframe.referrerPolicy = 'no-referrer';
    iframe.src = '/api/message/' + id + '/frame?to=' + encodeURIComponent(currentAddress) +
      '&t=' + encodeURIComponent(currentToken);
    els.detailBody.appendChild(iframe);
  } else if (m.text_body) {
    const pre = document.createElement('pre'); pre.textContent = m.text_body;
    els.detailBody.appendChild(pre);
  } else {
    const pre = document.createElement('pre'); pre.textContent = '(kein Inhalt)';
    els.detailBody.appendChild(pre);
  }
  els.detail.showModal();
}

function startExpiresTicker() {
  if (expiresTimer) clearInterval(expiresTimer);
  updateExpiresLabel();
  expiresTimer = setInterval(updateExpiresLabel, 1000);
}
function updateExpiresLabel() {
  if (!currentExpiresAt) { els.expiresInfo.textContent = ''; return; }
  const ms = currentExpiresAt - Date.now();
  if (ms <= 0) {
    els.expiresInfo.textContent = 'Adresse ist abgelaufen';
    els.expiresInfo.classList.remove('is-warn'); els.expiresInfo.classList.add('is-danger');
    return;
  }
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const pad = (n) => String(n).padStart(2, '0');
  els.expiresInfo.textContent = 'Läuft ab in ' + pad(h) + ':' + pad(m) + ':' + pad(s);
  els.expiresInfo.classList.remove('is-danger');
  if (h < 1) els.expiresInfo.classList.add('is-warn');
  else els.expiresInfo.classList.remove('is-warn');
}
// Show the notice card (with the in-app "load a new address" button) instead of
// the mail/Google cards. Used both for a natural 24h expiry and the trainer's
// emergency reset — only the wording differs. No browser reload needed.
function showRetiredState(title, text) {
  if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  if (expiresTimer) { clearInterval(expiresTimer); expiresTimer = null; }
  safeLocalRemove(ADDRESS_STORAGE_KEY);
  safeLocalRemove(GOOGLE_STORAGE_KEY);
  currentAddress = null; currentExpiresAt = null;
  if (els.resetTitle) els.resetTitle.textContent = title;
  if (els.resetText) els.resetText.textContent = text;
  if (els.stepMain) els.stepMain.hidden = true;
  if (els.resetNotice) els.resetNotice.hidden = false;
}

function markExpired() {
  showRetiredState('Adresse abgelaufen', 'Diese Adresse ist nicht mehr gültig. Hol dir mit einem Klick eine neue.');
}

async function restartSession() {
  if (els.resetNotice) els.resetNotice.hidden = true;
  if (els.stepMain) els.stepMain.hidden = false;
  setHelp('Neue Adresse wird geladen …');
  await onNewAddress();
}

function setHelp(text) { els.addressHelp.textContent = text; }

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts); const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('de-AT', { hour: '2-digit', minute: '2-digit' });
  }
  return d.toLocaleString('de-AT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

let toastTimer = null;
function toast(text) {
  els.toast.textContent = text;
  els.toast.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 2400);
}

function safeLocalGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function safeLocalSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function safeLocalRemove(k) { try { localStorage.removeItem(k); } catch (e) {} }

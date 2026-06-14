// Admin panel: login/setup/password change, dashboard, and state-changing
// workshop/Google actions. All auth + CSRF gating lives here.

import {
  renderWorkshopDashboard, renderAdminLogin,
  renderSetupPassword, renderPasswordChange,
  renderSetupOperator, renderSetupGoogle, systemCheckCells
} from '../pages.js';
import { getSetting, setSetting } from '../domain/settings.js';
import { hashPassword, verifyPassword } from '../lib/passwords.js';
import { sha256Hex, generateSecret } from '../lib/util.js';
import { makeCipher, cipherEncrypt, cipherDecrypt } from '../lib/crypto.js';
import { googleConfig, testGoogleConnection } from '../lib/google.js';
import {
  resolveGoogleConfig, googleAccountStats, recordGoogleTest, googleTestSummary, wipeAllSessions,
} from '../domain/google.js';
import { randomToken, MAX_GENERATION_ATTEMPTS, ALWAYS_ON_UNTIL } from '../domain/address.js';
import { jsonResponse, htmlResponse, parseCookies } from '../lib/http.js';
import {
  findWorkshopTrainer, findFirstTrainer, deactivateAllTrainers, insertWorkshopTrainer, lastMessageAt,
} from '../db/queries.js';

// CSRF defense: every state-changing POST must be same-origin — a present
// Origin/Referer that does not match this site is rejected (the primary guard).
// The auth cookie is SameSite=Lax: NOT sent on cross-site POSTs (CSRF on state
// changes stays blocked) but sent on top-level GET navigations, so reopening the
// browser keeps you logged in (iOS Safari drops SameSite=Strict cookies on a fresh
// navigation). Missing Origin/Referer is allowed. Returns true when safe to process.
function isSameOrigin(request, url) {
  const origin = request.headers.get('origin');
  if (origin) return origin === url.origin;
  const referer = request.headers.get('referer');
  if (referer) {
    try { return new URL(referer).origin === url.origin; } catch { return false; }
  }
  return true;
}

// SEC-04: per-IP admin-login throttle. Self-healing (the cooldown auto-expires)
// and per-IP (no global lockout, so an attacker cannot lock the real admin out).
// Stored in settings as "loginguard:<ip>" = "<fails>:<untilMs>".
const LOGIN_MAX_FAILS = 8;
const LOGIN_COOLDOWN_MS = 60 * 1000;
const clientIp = (request) => request.headers.get('cf-connecting-ip') || 'unknown';

async function loginLockedUntil(env, ip, now) {
  const raw = await getSetting(env, 'loginguard:' + ip);
  if (!raw) return 0;
  const until = parseInt(raw.split(':')[1] || '0', 10);
  return until > now ? until : 0;
}
async function recordLoginFail(env, ip, now) {
  const raw = await getSetting(env, 'loginguard:' + ip);
  const fails = (raw ? parseInt(raw.split(':')[0] || '0', 10) : 0) + 1;
  const until = fails >= LOGIN_MAX_FAILS ? now + LOGIN_COOLDOWN_MS : 0;
  // Reset the counter when we lock, so each cooldown window starts a fresh batch.
  await setSetting(env, 'loginguard:' + ip, (until ? 0 : fails) + ':' + until);
}

export async function handleAdmin(request, env, url) {
  const adminKey = env.ADMIN_KEY || '';

  // Block cross-origin state changes before doing anything else.
  if (request.method === 'POST' && !isSameOrigin(request, url)) {
    return new Response('Cross-origin request blocked', { status: 403 });
  }

  // Logout
  if (url.pathname === '/admin/logout') {
    return new Response('', {
      status: 303,
      headers: {
        location: '/admin',
        'set-cookie': 'mzm_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax'
      }
    });
  }

  // Where does the admin password live? Precedence: settings DB -> legacy secret.
  const dbHash = await getSetting(env, 'admin_password_hash');
  const legacyPw = env.COCKPIT_PASSWORD || '';
  const passwordConfigured = !!dbHash || !!legacyPw;

  // Cookie carries a stable secret derived from the active credential.
  // For the legacy path this equals sha256Hex(COCKPIT_PASSWORD) — identical to
  // before, so existing live admin sessions keep working unchanged.
  const authSecret = dbHash ? await sha256Hex(dbHash) : (legacyPw ? await sha256Hex(legacyPw) : '');
  const cookies = parseCookies(request.headers.get('cookie') || '');
  const cookieValid = !!authSecret && cookies['mzm_admin'] === authSecret;
  const urlKey = url.searchParams.get('key') || '';
  const urlKeyValid = adminKey && urlKey === adminKey;
  const authed = cookieValid || urlKeyValid;

  const thirtyDaysSec = 30 * 24 * 3600;
  const setCookie = (secret) => `mzm_admin=${secret}; Path=/; Max-Age=${thirtyDaysSec}; HttpOnly; Secure; SameSite=Lax`;

  // SEC-05: a valid ?key= upgrades to the auth cookie and redirects to a clean URL,
  // so the admin key isn't carried (and thus logged / shared / left in history) in
  // every subsequent URL. Only on GET; POST actions authenticate via cookie/form.
  if (urlKeyValid && authSecret && request.method === 'GET') {
    const clean = new URL(url);
    clean.searchParams.delete('key');
    return new Response('', {
      status: 303,
      headers: { location: clean.pathname + (clean.search || ''), 'set-cookie': setCookie(authSecret) },
    });
  }

  // First-run setup: no password configured anywhere -> assistant step 1.
  if (!passwordConfigured) {
    if (url.pathname === '/admin' && request.method === 'POST') {
      const form = await request.formData();
      if (form.get('action') === 'setup_password') {
        const pw = (form.get('password') || '').toString();
        const pw2 = (form.get('password2') || '').toString();
        if (pw.length < 10) return htmlResponse(renderSetupPassword({ error: 'Mindestens 10 Zeichen.' }), 400);
        if (pw !== pw2) return htmlResponse(renderSetupPassword({ error: 'Die Passwörter stimmen nicht überein.' }), 400);
        const hash = await hashPassword(pw);
        await setSetting(env, 'admin_password_hash', hash);
        await setSetting(env, 'setup_completed', '0'); // assistant now in progress
        return new Response('', { status: 303, headers: { location: '/admin', 'set-cookie': setCookie(await sha256Hex(hash)) } });
      }
    }
    return htmlResponse(renderSetupPassword({}));
  }

  // First-run assistant steps 2+3 — only while explicitly in progress.
  // This state is created solely by genuine first-run step 1 (above), so a
  // live instance with a legacy password (and no setup_completed) never enters here.
  if (await getSetting(env, 'setup_completed') === '0') {
    if (!authed) return htmlResponse(renderAdminLogin({}));
    return await handleSetupAssistant(request, env, url);
  }

  // Change password (must be logged in).
  if (url.pathname === '/admin/password') {
    if (!authed) return htmlResponse(renderAdminLogin({}), 401);
    if (request.method === 'POST') {
      const form = await request.formData();
      const pw = (form.get('password') || '').toString();
      const pw2 = (form.get('password2') || '').toString();
      if (dbHash) {
        const current = (form.get('current') || '').toString();
        if (!await verifyPassword(current, dbHash)) {
          return htmlResponse(renderPasswordChange({ needsCurrent: true, error: 'Aktuelles Passwort falsch.' }), 401);
        }
      }
      if (pw.length < 10) return htmlResponse(renderPasswordChange({ needsCurrent: !!dbHash, error: 'Mindestens 10 Zeichen.' }), 400);
      if (pw !== pw2) return htmlResponse(renderPasswordChange({ needsCurrent: !!dbHash, error: 'Die Passwörter stimmen nicht überein.' }), 400);
      const hash = await hashPassword(pw);
      await setSetting(env, 'admin_password_hash', hash);
      return new Response('', {
        status: 303,
        headers: { location: '/admin?flash=' + encodeURIComponent('Passwort geändert.'), 'set-cookie': setCookie(await sha256Hex(hash)) }
      });
    }
    return htmlResponse(renderPasswordChange({ needsCurrent: !!dbHash }));
  }

  // Login POST
  if (url.pathname === '/admin' && request.method === 'POST') {
    const form = await request.formData();
    if (form.get('action')) {
      if (!authed) return new Response('Not authorized', { status: 403 });
      return await handleAdminAction(form, env, url);
    }
    const submitted = (form.get('password') || '').toString();
    const ip = clientIp(request);
    if (await loginLockedUntil(env, ip, Date.now())) {
      return htmlResponse(renderAdminLogin({ error: 'Zu viele Fehlversuche. Bitte kurz warten und erneut versuchen.' }), 429);
    }
    const ok = dbHash ? await verifyPassword(submitted, dbHash) : (legacyPw && submitted === legacyPw);
    if (ok) {
      await setSetting(env, 'loginguard:' + ip, '0:0'); // reset on success
      return new Response('', { status: 303, headers: { location: '/admin', 'set-cookie': setCookie(authSecret) } });
    }
    await recordLoginFail(env, ip, Date.now());
    return htmlResponse(renderAdminLogin({ error: 'Falsches Passwort.' }), 401);
  }

  if (!authed) {
    return htmlResponse(renderAdminLogin({}));
  }

  // Lightweight live status (polled by the dashboard every 15 s) — keeps the Google
  // counter AND the System-Check fresh without a page reload (e.g. the "last mail
  // received" time flips as soon as a mail arrives).
  if (url.searchParams.get('fragment') === 'google-count') {
    const stats = await googleAccountStats(env);
    return jsonResponse({ ...stats, sc: systemCheckCells(await gatherSelfCheck(env)) });
  }

  return dashboardHtml(env, url);
}

// Worker-side self-check inputs. The lastMessageAt query doubles as the "D1
// reachable" proof. Shared by the dashboard render and the live poll fragment.
async function gatherSelfCheck(env) {
  return {
    mailDomainSet: !!env.MAIL_DOMAIN,
    encKeySet: !!env.MAIL_ENCRYPTION_KEY,
    lastMailAt: await lastMessageAt(env.DB),
  };
}

// Renders the admin dashboard (workshop card + Google modal). Shared by the GET
// handler and by the Google save/test actions, so the modal always overlays admin.
async function dashboardHtml(env, url, extra = {}) {
  const defaultToken = (await getSetting(env, 'default_workshop_token'))
    || (env.ADMIN_TRAINER_TOKEN || '').toLowerCase() || null;
  let workshop = defaultToken
    ? await findWorkshopTrainer(env.DB, defaultToken)
    : null;
  if (!workshop) {
    workshop = await findFirstTrainer(env.DB);
  }
  const gKeyEnc = await getSetting(env, 'google_sa_key_enc');
  const gCfg = await resolveGoogleConfig(env);
  const google = {
    source: gKeyEnc ? 'settings' : (env.GOOGLE_SA_KEY ? 'secret' : 'none'),
    subject: (await getSetting(env, 'google_admin_subject')) || env.GOOGLE_ADMIN_SUBJECT || '',
    domain: (await getSetting(env, 'google_account_domain')) || env.GOOGLE_ACCOUNT_DOMAIN || env.MAIL_DOMAIN || '',
    hasKey: !!(gKeyEnc || env.GOOGLE_SA_KEY),
    ...(extra.google || {}),
  };
  const googleStats = await googleAccountStats(env);
  const lastTestOk = await getSetting(env, 'google_last_test_ok');
  // Self-check (mail/config path) — lets a self-hoster verify the basics the way
  // "Verbindung testen" verifies Google. admin.js refreshes it live via the poll.
  const selfCheck = await gatherSelfCheck(env);
  return htmlResponse(renderWorkshopDashboard({
    workshop,
    serviceName: (await getSetting(env, 'operator_service_name')) || 'malziMAIL',
    googleActive: !!gCfg,
    googleTestedOk: lastTestOk == null ? null : lastTestOk === '1',
    googleStats,
    google,
    selfCheck,
    now: Date.now(), origin: url.origin,
    flash: extra.flash !== undefined ? extra.flash : url.searchParams.get('flash'),
  }));
}

// First-run assistant: step 2 (operator data) and step 3 (workshop link name).
// Reached only while setup_completed === '0' and the admin is authenticated.
async function handleSetupAssistant(request, env, url) {
  if (request.method === 'POST') {
    const form = await request.formData();
    const action = (form.get('action') || '').toString();

    if (action === 'setup_operator') {
      const fields = ['service_name', 'owner', 'street', 'zip', 'city', 'email'];
      const values = {};
      for (const f of fields) values[f] = (form.get(f) || '').toString().trim();
      // All fields are required (legal pages must be complete).
      const missing = fields.find((f) => !values[f]);
      if (missing) {
        return htmlResponse(renderSetupOperator({ values, error: 'Bitte alle Felder ausfüllen.' }), 400);
      }
      for (const f of fields) await setSetting(env, `operator_${f}`, values[f]);
      // Company name is optional (a sole proprietor may carry both a person + a firm).
      await setSetting(env, 'operator_company', (form.get('company') || '').toString().trim());
      // "Stand"-date for the legal pages = install date (renewed on later edits).
      await setSetting(env, 'operator_legal_date', new Date().toLocaleDateString('de-AT', { day: '2-digit', month: 'long', year: 'numeric' }));
      // Setup is NOT finished yet — the mandatory Google step (3) still follows.
      return new Response('', { status: 303, headers: { location: '/admin' } });
    }

    // Step 3 (MANDATORY): Google access. There is no service without Google, so the
    // setup only completes once the live connection test succeeds (hard stop).
    if (action === 'setup_google') {
      const subject = (form.get('subject') || '').toString().trim();
      const domain = (form.get('domain') || '').toString().trim();
      const saKey = (form.get('sa_key') || '').toString().trim();
      const values = { subject, domain };
      if (!subject || !domain || !saKey) {
        return htmlResponse(renderSetupGoogle({ values, error: 'Bitte Admin-Konto, Domain und Service-Account-Schlüssel angeben.' }), 400);
      }
      if (!googleConfig({ GOOGLE_SA_KEY: saKey, GOOGLE_ADMIN_SUBJECT: 'x', GOOGLE_ACCOUNT_DOMAIN: 'x' })) {
        return htmlResponse(renderSetupGoogle({ values, error: 'Kein gültiger Service-Account-JSON (client_email/private_key fehlen oder das JSON ist ungültig).' }), 400);
      }
      await setSetting(env, 'google_admin_subject', subject);
      await setSetting(env, 'google_account_domain', domain);
      await setSetting(env, 'google_sa_key_enc', await cipherEncrypt(saKey, await makeCipher(env.MAIL_ENCRYPTION_KEY, 'google')));
      const cfg = await resolveGoogleConfig(env);
      const test = cfg ? await testGoogleConnection(cfg) : { ok: false, detail: 'Konfiguration unvollständig.' };
      await recordGoogleTest(env, test);
      if (!test.ok) {
        return htmlResponse(renderSetupGoogle({ values, error: 'Verbindung zu Google fehlgeschlagen: ' + googleTestSummary(test) + '. Bitte Daten + domänenweite Delegierung prüfen.' }), 400);
      }
      await setSetting(env, 'setup_completed', '1'); // hard stop cleared — Google verified
      return new Response('', { status: 303, headers: { location: '/admin?flash=' + encodeURIComponent('Einrichtung abgeschlossen · Google verbunden.') } });
    }
    return new Response('', { status: 303, headers: { location: '/admin' } });
  }

  // GET: operator data first (step 2), then the mandatory Google step (3).
  if (!(await getSetting(env, 'operator_owner'))) return htmlResponse(renderSetupOperator({}));
  return htmlResponse(renderSetupGoogle({
    values: {
      subject: (await getSetting(env, 'google_admin_subject')) || '',
      domain: (await getSetting(env, 'google_account_domain')) || '',
    },
  }));
}

async function handleAdminAction(form, env, url) {
  const action = form.get('action').toString();
  const redirectTo = (msg) => new Response('', {
    status: 303,
    headers: { location: '/admin?flash=' + encodeURIComponent(msg) }
  });

  try {
    if (action === 'save_google') {
      await setSetting(env, 'google_admin_subject', (form.get('subject') || '').toString().trim());
      await setSetting(env, 'google_account_domain', (form.get('domain') || '').toString().trim());
      const saKey = (form.get('sa_key') || '').toString().trim();
      if (saKey) {
        if (!googleConfig({ GOOGLE_SA_KEY: saKey, GOOGLE_ADMIN_SUBJECT: 'x', GOOGLE_ACCOUNT_DOMAIN: 'x' })) {
          return dashboardHtml(env, url, { flash: null, google: { modalOpen: true, formError: 'Kein gültiger Service-Account-JSON — client_email/private_key fehlen oder das JSON ist ungültig.' } });
        }
        await setSetting(env, 'google_sa_key_enc', await cipherEncrypt(saKey, await makeCipher(env.MAIL_ENCRYPTION_KEY, 'google')));
      }
      // Run the connection test BEFORE closing the modal, so the dashboard can
      // show the real state. The modal closes regardless of the outcome.
      const savedCfg = await resolveGoogleConfig(env);
      const saveTest = savedCfg
        ? await testGoogleConnection(savedCfg)
        : { ok: false, step: 'config', detail: 'Admin-Konto, Domain oder Schlüssel fehlt noch.' };
      await recordGoogleTest(env, saveTest);
      return redirectTo('Gespeichert · ' + googleTestSummary(saveTest));
    }
    if (action === 'delete_google_all') {
      const w = await wipeAllSessions(env);
      return jsonResponse({
        ok: true, ...w,
        message: `Notfall-Reset: ${w.deleted} Google-Konten gelöscht${w.failed ? `, ${w.failed} fehlgeschlagen` : ''}, ${w.reset} Sitzungen zurückgesetzt.`,
      });
    }
    // Start = create a FRESH rotating participant link each time. No token input,
    // no fixed runtime: it runs until "stop". Any previous link is deactivated
    // first so exactly one link is ever active.
    if (action === 'activate') {
      const serviceName = (await getSetting(env, 'operator_service_name')) || 'Mein Workshop';
      const secret = generateSecret();
      const secretHash = await sha256Hex(secret);
      const secretEncrypted = await cipherEncrypt(secret, await makeCipher(env.MAIL_ENCRYPTION_KEY, 'mail'));
      const now = Date.now();
      await deactivateAllTrainers(env.DB); // kill any previous link
      let newToken = null;
      for (let i = 0; i < MAX_GENERATION_ATTEMPTS; i++) {
        const cand = randomToken();
        const res = await insertWorkshopTrainer(env.DB, {
          token: cand, name: serviceName, secretHash, secretEncrypted, activeUntil: ALWAYS_ON_UNTIL, now,
        });
        if (res.meta.changes === 1) { newToken = cand; break; }
      }
      if (!newToken) return redirectTo('Fehler: Konnte keinen Link erzeugen, bitte erneut versuchen.');
      await setSetting(env, 'default_workshop_token', newToken);
      // No confirmation flash — the dashboard already shows "Workshop läuft" + the link.
      return new Response('', { status: 303, headers: { location: '/admin' } });
    }
    // Stop = wipe everything (Google accounts + mailboxes) and kill the link.
    // Returns JSON so the modal can show a spinner and reload when done.
    if (action === 'stop') {
      const w = await wipeAllSessions(env);
      await deactivateAllTrainers(env.DB);
      return jsonResponse({
        ok: true, ...w,
        message: `Workshop gestoppt · ${w.deleted} Google-Konten gelöscht${w.failed ? `, ${w.failed} fehlgeschlagen` : ''}, ${w.reset} Sitzungen zurückgesetzt.`,
      });
    }
    if (action === 'test_google_form') {
      const fSubject = (form.get('subject') || '').toString().trim();
      const fDomain = (form.get('domain') || '').toString().trim();
      let rawKey = (form.get('sa_key') || '').toString().trim();
      if (!rawKey) {
        const keyEnc = await getSetting(env, 'google_sa_key_enc');
        if (keyEnc) {
          const dec = await cipherDecrypt(keyEnc, await makeCipher(env.MAIL_ENCRYPTION_KEY, 'google'));
          if (dec && dec.startsWith('{')) rawKey = dec;
        }
        if (!rawKey) rawKey = env.GOOGLE_SA_KEY || '';
      }
      const subject = fSubject || (await getSetting(env, 'google_admin_subject')) || env.GOOGLE_ADMIN_SUBJECT || '';
      const domain = fDomain || (await getSetting(env, 'google_account_domain')) || env.GOOGLE_ACCOUNT_DOMAIN || env.MAIL_DOMAIN || '';
      const cfg = (rawKey && subject && domain)
        ? googleConfig({ GOOGLE_SA_KEY: rawKey, GOOGLE_ADMIN_SUBJECT: subject, GOOGLE_ACCOUNT_DOMAIN: domain })
        : null;
      const modalTest = cfg
        ? await testGoogleConnection(cfg)
        : { ok: false, step: 'config', detail: 'Bitte Admin-Konto, Domain und einen Schlüssel angeben.' };
      if (cfg) await recordGoogleTest(env, modalTest); // keep the dashboard status in sync
      return dashboardHtml(env, url, { flash: null, google: { modalOpen: true, modalTest, ...(fSubject ? { subject: fSubject } : {}), ...(fDomain ? { domain: fDomain } : {}) } });
    }

    return redirectTo('Unbekannte Aktion.');
  } catch (err) {
    console.error('Admin action failed');
    return redirectTo('Fehler bei der Ausführung.');
  }
}

// Google config is a modal ON the admin dashboard (no standalone page). It stores
// subject/domain + the service-account key ENCRYPTED at rest (never plaintext),
// and the save/test actions post to /admin so the modal always overlays the admin.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import {beforeEach, describe, it, expect} from 'vitest';
import worker from '../../src/index.js';

beforeEach(async () => {
  await env.DB.exec('DELETE FROM settings');
  await env.DB.exec('DELETE FROM trainers');
  await env.DB.exec('DELETE FROM addresses');
  // A workshop must exist so the full dashboard (incl. the Google modal) renders.
  await env.DB.prepare(
    'INSERT INTO trainers (token, name, secret_hash, secret_encrypted, daily_used_limit, daily_gen_limit, active_until, enabled, created_at, notes, google_enabled) ' +
    'VALUES (?, ?, ?, ?, NULL, NULL, 0, 1, ?, NULL, 1)',
  ).bind('kurs', 'Kurs', 'h', 'e', Date.now()).run();
});

const ORIGIN = 'https://example.test';
// COCKPIT_PASSWORD path = legacy login, which skips the first-run setup assistant.
const EXTRA = { COCKPIT_PASSWORD: 'live-secret', MAIL_ENCRYPTION_KEY: 'test-key-123' };
const VALID_KEY = JSON.stringify({
  client_email: 'robot@x.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n',
});

async function call(path, { method = 'GET', cookie = '', body } = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body) headers['content-type'] = 'application/x-www-form-urlencoded';
  const req = new Request(ORIGIN + path, { method, headers, body });
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, { ...env, ...EXTRA }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const form = (obj) => new URLSearchParams(obj).toString();
async function login() {
  const res = await call('/admin', { method: 'POST', body: form({ password: 'live-secret' }) });
  return (res.headers.get('set-cookie') || '').split(';')[0];
}

describe('admin Google configuration (modal on the dashboard)', () => {
  it('the dashboard contains the Google modal, status "not configured"', async () => {
    const cookie = await login();
    const html = await call('/admin', { cookie }).then((r) => r.text());
    expect(html).toContain('Google-Konfiguration');
    expect(html).toContain('id="gModal"');
    expect(html).toContain('nicht eingerichtet');
  });

  it('save_google stores subject/domain + the key ENCRYPTED, then shows "eingerichtet"', async () => {
    const cookie = await login();
    const res = await call('/admin', {
      method: 'POST', cookie,
      body: form({ action: 'save_google', subject: 'admin@id.example', domain: 'example.at', sa_key: VALID_KEY }),
    });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toMatch(/^\/admin/);

    const keyRow = await env.DB.prepare("SELECT value FROM settings WHERE key='google_sa_key_enc'").first();
    expect(keyRow.value).toMatch(/^ENC2:/);            // encrypted envelope (HKDF, domain-separated)
    expect(keyRow.value).not.toContain('private_key'); // never the raw JSON
    expect(await env.DB.prepare("SELECT value FROM settings WHERE key='google_admin_subject'").first().then((r) => r.value)).toBe('admin@id.example');

    const html = await call('/admin', { cookie }).then((r) => r.text());
    expect(html).toContain('Google ist eingerichtet');
  });

  it('save_google runs a connection test, records the outcome, and still closes (redirects)', async () => {
    const cookie = await login();
    const res = await call('/admin', {
      method: 'POST', cookie,
      body: form({ action: 'save_google', subject: 'admin@id.example', domain: 'example.at', sa_key: VALID_KEY }),
    });
    // Modal closes regardless of the test outcome -> redirect, with the result in the flash.
    expect(res.status).toBe(303);
    expect(decodeURIComponent(res.headers.get('location'))).toContain('Verbindung');
    // The fake key can't sign -> the test fails -> recorded as not ok.
    expect(await env.DB.prepare("SELECT value FROM settings WHERE key='google_last_test_ok'").first().then((r) => r.value)).toBe('0');
    // The dashboard now shows the real (failed) connection state, not just "eingerichtet".
    const html = await call('/admin', { cookie }).then((r) => r.text());
    expect(html).toContain('Verbindung fehlgeschlagen');
  });

  it('an invalid key JSON re-opens the modal with an error and stores no key', async () => {
    const cookie = await login();
    const res = await call('/admin', {
      method: 'POST', cookie,
      body: form({ action: 'save_google', subject: 'a', domain: 'b', sa_key: 'not-valid-json' }),
    });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Kein gültiger Service-Account-JSON');
    expect(await env.DB.prepare("SELECT value FROM settings WHERE key='google_sa_key_enc'").first()).toBeNull();
  });

  it('test_google_form shows the result in the modal and keeps the entered values', async () => {
    const cookie = await login();
    const res = await call('/admin', {
      method: 'POST', cookie,
      body: form({ action: 'test_google_form', subject: 'a@id.example', domain: 'example.at', sa_key: VALID_KEY }),
    });
    expect(res.status).toBe(200);
    const html = await res.text();
    // VALID_KEY's PEM can't sign -> the test fails; result shown, entered subject preserved.
    expect(html).toContain('Verbindung fehlgeschlagen');
    expect(html).toContain('a@id.example');
  });

  it('a Google action requires authentication', async () => {
    const res = await call('/admin', { method: 'POST', body: form({ action: 'save_google', subject: 'x' }) });
    expect(res.status).toBe(403);
  });

  it('the live counter reports how many Google accounts currently exist', async () => {
    const cookie = await login();
    // Two addresses with a google_login = two accounts live at Google; one without.
    await env.DB.prepare("INSERT INTO addresses (address, created_at, expires_at, trainer_token, google_login) VALUES ('a@x', 0, 0, 'kurs', 'a@x')").run();
    await env.DB.prepare("INSERT INTO addresses (address, created_at, expires_at, trainer_token, google_login) VALUES ('b@x', 0, 0, 'kurs', 'b@x')").run();
    await env.DB.prepare("INSERT INTO addresses (address, created_at, expires_at, trainer_token, google_login) VALUES ('c@x', 0, 0, 'kurs', NULL)").run();

    const res = await call('/admin?fragment=google-count', { cookie });
    expect(res.headers.get('content-type')).toContain('application/json');
    const j = await res.json();
    expect(j.active).toBe(2);
    expect(j.limit).toBe(50);          // free-tier default
    expect(j.free).toBe(48);
    // The poll also carries the System-Check cells so admin.js can refresh them live.
    expect(j.sc).toBeTruthy();
    expect(Object.keys(j.sc)).toEqual(['maildomain', 'enckey', 'db', 'lastmail']);
    expect(j.sc.lastmail).toContain('noch keine E-Mail empfangen'); // no message seeded
  });

  it('delete_google_all is a full reset: empties mailbox, retires active addresses, returns JSON', async () => {
    const cookie = await login();
    const future = Date.now() + 3_600_000;
    // An ACTIVE session with a message + a stale Google login.
    await env.DB.prepare("INSERT INTO addresses (address, created_at, expires_at, trainer_token, google_login) VALUES ('act@x', 0, ?, 'kurs', 'act@x')").bind(future).run();
    await env.DB.prepare("INSERT INTO messages (to_addr, from_addr, subject, received_at) VALUES ('act@x', 's@x', 'hi', 1)").run();

    const res = await call('/admin', { method: 'POST', cookie, body: form({ action: 'delete_google_all' }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.reset).toBe(1);                    // one active address retired
    expect(j.message).toContain('Notfall-Reset');

    // The address is retired (expires_at = 0 sentinel) and its mailbox is emptied.
    const row = await env.DB.prepare("SELECT expires_at FROM addresses WHERE address='act@x'").first();
    expect(row.expires_at).toBe(0);
    const msgs = await env.DB.prepare("SELECT COUNT(*) AS c FROM messages WHERE to_addr='act@x'").first();
    expect(msgs.c).toBe(0);

    // The participant's poll (with the workshop token) now sees the "reset" reason.
    const poll = await call('/api/messages?to=' + encodeURIComponent('act@x') + '&t=kurs');
    expect(poll.status).toBe(410);
    expect(await poll.json().then((d) => d.error)).toBe('reset');
  });

  it('SEC-02: mailbox read/export is denied without the owning workshop token', async () => {
    const future = Date.now() + 3_600_000;
    await env.DB.prepare("INSERT INTO addresses (address, created_at, expires_at, trainer_token) VALUES ('mine@x', 0, ?, 'kurs')").bind(future).run();
    await env.DB.prepare("INSERT INTO messages (to_addr, from_addr, subject, received_at) VALUES ('mine@x', 's@x', 'geheim', 1)").run();

    // No token -> 403 (an outsider who only knows the address cannot read it).
    expect((await call('/api/messages?to=mine@x')).status).toBe(403);
    expect((await call('/api/export?to=mine@x')).status).toBe(403);
    // Wrong workshop token -> 403.
    expect((await call('/api/messages?to=mine@x&t=anderer')).status).toBe(403);
    // Correct workshop token -> 200 with the messages.
    const ok = await call('/api/messages?to=mine@x&t=kurs');
    expect(ok.status).toBe(200);
    expect(await ok.json().then((d) => d.messages.length)).toBe(1);
  });

  it('delete_google_all requires authentication', async () => {
    const res = await call('/admin', { method: 'POST', body: form({ action: 'delete_google_all' }) });
    expect(res.status).toBe(403);
  });

  it('SEC-04: throttles repeated failed admin logins', async () => {
    for (let i = 0; i < 8; i++) {
      expect((await call('/admin', { method: 'POST', body: form({ password: 'wrong' }) })).status).toBe(401);
    }
    // 9th attempt is locked out (429), and even the correct password is refused while locked.
    expect((await call('/admin', { method: 'POST', body: form({ password: 'wrong' }) })).status).toBe(429);
    expect((await call('/admin', { method: 'POST', body: form({ password: 'live-secret' }) })).status).toBe(429);
  });

  it('an admin URL key (?key=) is NOT a login path — it is ignored', async () => {
    // ADMIN_KEY was removed: even if the env var is set, ?key= must not authenticate.
    const req = new Request(ORIGIN + '/admin?key=secret-key');
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, { ...env, ...EXTRA, ADMIN_KEY: 'secret-key' }, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(200);                                 // shows the login page, not a session
    expect(res.headers.get('set-cookie') || '').not.toMatch(/mzm_admin=/); // no admin cookie granted
    expect(await res.text()).toContain('Anmelden');
  });

  it('the key identifier is NOT shown in the modal', async () => {
    const cookie = await login();
    await call('/admin', {
      method: 'POST', cookie,
      body: form({ action: 'save_google', subject: 'admin@id.example', domain: 'example.at', sa_key: VALID_KEY }),
    });
    const html = await call('/admin', { cookie }).then((r) => r.text());
    expect(html).toContain('Google ist eingerichtet');
    expect(html).not.toContain('Service-Account:'); // no key/identifier leaked into the UI
  });

  it('rejects a cross-origin admin POST even with a valid cookie (CSRF guard)', async () => {
    const cookie = await login();
    const req = new Request(ORIGIN + '/admin', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', origin: 'https://evil.test' },
      body: form({ action: 'save_google', subject: 'x', domain: 'y', sa_key: VALID_KEY }),
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, { ...env, ...EXTRA }, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(403);
    // The mismatched origin was blocked before any settings were written.
    expect(await env.DB.prepare("SELECT value FROM settings WHERE key='google_admin_subject'").first()).toBeNull();
  });

  it('allows a same-origin admin POST', async () => {
    const cookie = await login();
    const req = new Request(ORIGIN + '/admin', {
      method: 'POST',
      headers: { cookie, 'content-type': 'application/x-www-form-urlencoded', origin: ORIGIN },
      body: form({ action: 'save_google', subject: 'admin@id.example', domain: 'example.at', sa_key: VALID_KEY }),
    });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, { ...env, ...EXTRA }, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).not.toBe(403); // not blocked by the CSRF guard
  });

  it('the live counter requires authentication', async () => {
    const res = await call('/admin?fragment=google-count');
    // No cookie -> the login page (HTML), never the JSON counter.
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('Anmelden');
  });
});

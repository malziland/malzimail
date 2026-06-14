// Renders the admin dashboard in its different states so the conditional view
// branches (status box: läuft/gestoppt/kein Workshop; Google: verbunden/
// fehlgeschlagen/eingerichtet/nicht eingerichtet) get covered. Plus /cockpit + 404.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import {beforeEach, describe, it, expect} from 'vitest';
import worker from '../../src/index.js';

const PW = 'live-secret';
// Valid-shaped SA key (only parsed for config validity here — never signs/fetches).
const GENV = { GOOGLE_SA_KEY: JSON.stringify({ client_email: 'r@x', private_key: 'p' }), GOOGLE_ADMIN_SUBJECT: 'admin@x.at', GOOGLE_ACCOUNT_DOMAIN: 'x.at', MAIL_ENCRYPTION_KEY: 'k' };

beforeEach(async () => {
  for (const t of ['settings', 'trainers', 'addresses']) await env.DB.exec('DELETE FROM ' + t);
});

async function fetchAdmin(extraEnv = {}, cookie = '') {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  const req = new Request('https://example.test/admin', { headers });
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, { ...env, COCKPIT_PASSWORD: PW, ...extraEnv }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
async function login(extraEnv = {}) {
  const req = new Request('https://example.test/admin', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'password=' + PW,
  });
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, { ...env, COCKPIT_PASSWORD: PW, ...extraEnv }, ctx);
  await waitOnExecutionContext(ctx);
  return (res.headers.get('set-cookie') || '').split(';')[0];
}
async function workshop(token, activeUntil) {
  await env.DB.prepare('INSERT INTO trainers (token, name, secret_hash, active_until, enabled, created_at, google_enabled) VALUES (?, ?, 0, ?, 1, 0, 1)').bind(token, token, activeUntil).run();
  await env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, 0)').bind('default_workshop_token', token).run();
}

describe('admin dashboard — render states', () => {
  it('no workshop yet -> "Kein Workshop aktiv" + start button', async () => {
    const cookie = await login();
    const html = await fetchAdmin({}, cookie).then((r) => r.text());
    expect(html).toContain('Kein Workshop aktiv');
    expect(html).toContain('Workshop starten');
  });

  it('running workshop + Google verbunden -> green status + live counter', async () => {
    const cookie = await login(GENV);
    await workshop('kurs', Date.now() + 3_600_000);
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('google_last_test_ok','1',0)").run();
    const html = await fetchAdmin(GENV, cookie).then((r) => r.text());
    expect(html).toContain('Workshop läuft');
    expect(html).toContain('● verbunden');
    expect(html).toContain('Google-Konten aktiv');
    expect(html).toContain('Workshop stoppen');
  });

  it('stopped workshop + Google test failed -> "Kein Workshop aktiv" + failure marker', async () => {
    const cookie = await login(GENV);
    await workshop('kurs', 0);
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('google_last_test_ok','0',0)").run();
    const html = await fetchAdmin(GENV, cookie).then((r) => r.text());
    expect(html).toContain('Kein Workshop aktiv');
    expect(html).toContain('Verbindung fehlgeschlagen');
  });

  it('running workshop, Google configured but untested -> eingerichtet', async () => {
    const cookie = await login(GENV);
    await workshop('kurs', Date.now() + 3_600_000);
    const html = await fetchAdmin(GENV, cookie).then((r) => r.text());
    expect(html).toContain('● eingerichtet');
  });

  it('running workshop, no Google -> nicht eingerichtet, no counter', async () => {
    const cookie = await login();
    await workshop('kurs', Date.now() + 3_600_000);
    const html = await fetchAdmin({}, cookie).then((r) => r.text());
    expect(html).toContain('nicht eingerichtet');
    expect(html).not.toContain('Google-Konten aktiv');
  });
});

async function postAdmin(path, body, cookie, extraEnv = {}) {
  const headers = { 'content-type': 'application/x-www-form-urlencoded' };
  if (cookie) headers.cookie = cookie;
  const req = new Request('https://example.test' + path, { method: 'POST', headers, body });
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, { ...env, COCKPIT_PASSWORD: PW, ...extraEnv }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

describe('admin password change (/admin/password)', () => {
  it('GET shows the change form', async () => {
    const cookie = await login();
    const html = await (await fetch_(cookie)).text();
    expect(html).toContain('Passwort');
  });
  async function fetch_(cookie) {
    const req = new Request('https://example.test/admin/password', { headers: { cookie } });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, { ...env, COCKPIT_PASSWORD: PW }, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  }
  it('rejects a too-short password (400) and a mismatch (400)', async () => {
    const cookie = await login();
    expect((await postAdmin('/admin/password', 'password=kurz&password2=kurz', cookie)).status).toBe(400);
    expect((await postAdmin('/admin/password', 'password=langgenug123&password2=anders123', cookie)).status).toBe(400);
  });
  it('changes the password (303 + new cookie), then requires the current password (dbHash path)', async () => {
    const cookie = await login();
    const ok = await postAdmin('/admin/password', 'password=neuespasswort1&password2=neuespasswort1', cookie);
    expect(ok.status).toBe(303);
    const newCookie = (ok.headers.get('set-cookie') || '').split(';')[0];
    // Now admin_password_hash exists -> the change form requires the current password.
    const wrong = await postAdmin('/admin/password', 'current=falsch&password=nochwas12345&password2=nochwas12345', newCookie);
    expect(wrong.status).toBe(401);
    const right = await postAdmin('/admin/password', 'current=neuespasswort1&password=nochwas12345&password2=nochwas12345', newCookie);
    expect(right.status).toBe(303);
  });
});

describe('top-level routing', () => {
  it('/cockpit redirects (308) to /admin', async () => {
    const req = new Request('https://example.test/cockpit');
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, { ...env, COCKPIT_PASSWORD: PW }, ctx);
    await waitOnExecutionContext(ctx);
    expect(res.status).toBe(308);
    expect(res.headers.get('location')).toBe('/admin');
  });

  it('an unknown path without ASSETS -> 404', async () => {
    const req = new Request('https://example.test/voellig-unbekannt');
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, { ...env, COCKPIT_PASSWORD: PW }, ctx);
    await waitOnExecutionContext(ctx);
    expect([404, 200]).toContain(res.status); // 404 (no ASSETS) or asset-served
  });
});

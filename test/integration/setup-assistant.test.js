// Integration test: the first-run setup assistant against the real worker
// (fetch handler) and a local D1 binding. Google is now a MANDATORY step (3):
// setup only completes after a successful Google connection test (hard stop).
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import worker from '../../src/index.js';

// A real in-test RSA key so the Google JWT signs; fetch is mocked so the
// connection test (token + users.list) succeeds without hitting Google.
let SA_KEY;
beforeAll(async () => {
  const kp = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  let bin = ''; for (let i = 0; i < pkcs8.length; i++) bin += String.fromCharCode(pkcs8[i]);
  const pem = '-----BEGIN PRIVATE KEY-----\n' + btoa(bin).match(/.{1,64}/g).join('\n') + '\n-----END PRIVATE KEY-----\n';
  SA_KEY = JSON.stringify({ client_email: 'robot@x.iam.gserviceaccount.com', private_key: pem });
});
beforeEach(async () => {
  await env.DB.exec('DELETE FROM settings');
  await env.DB.exec('DELETE FROM trainers');
  await env.DB.exec('DELETE FROM addresses');
});
afterEach(() => vi.unstubAllGlobals());

function mockGoogleOk() {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (String(url).includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
    return new Response(JSON.stringify({ users: [] }), { status: 200 }); // users.list -> connection ok
  }));
}

const ORIGIN = 'https://example.test';
async function call(path, { method = 'GET', cookie = '', body } = {}, extraEnv = {}) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body) headers['content-type'] = 'application/x-www-form-urlencoded';
  const req = new Request(ORIGIN + path, { method, headers, body });
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, { ...env, MAIL_ENCRYPTION_KEY: 'k', ...extraEnv }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
function cookieFrom(res) {
  const sc = res.headers.get('set-cookie') || '';
  return sc.split(';')[0]; // "mzm_admin=<secret>"
}
const setting = (k) => env.DB.prepare('SELECT value FROM settings WHERE key=?').bind(k).first().then(r => r && r.value);
const form = (obj) => new URLSearchParams(obj).toString();

describe('first-run setup assistant (fresh instance, no password)', () => {
  it('shows the password setup on first /admin visit', async () => {
    const res = await call('/admin');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Passwort festlegen');
  });

  it('walks through password -> operator -> MANDATORY Google -> workshop', async () => {
    // Step 1: password
    let res = await call('/admin', { method: 'POST', body: form({ action: 'setup_password', password: 'supergeheim10', password2: 'supergeheim10' }) });
    expect(res.status).toBe(303);
    const cookie = cookieFrom(res);
    expect(cookie).toMatch(/^mzm_admin=/);
    expect(await setting('setup_completed')).toBe('0');

    // Step 2: operator form shown
    res = await call('/admin', { cookie });
    expect(await res.text()).toContain('Schritt 2 von 3');

    // Operator data -> still NOT finished (Google step 3 still pending)
    res = await call('/admin', { method: 'POST', cookie, body: form({ action: 'setup_operator', service_name: 'workshopmail', owner: 'Maria Muster', company: 'Muster GmbH', street: 'Weg 1', zip: '4020', city: 'Linz', email: 'office@example.test' }) });
    expect(res.status).toBe(303);
    expect(await setting('operator_owner')).toBe('Maria Muster');
    expect(await setting('setup_completed')).toBe('0'); // NOT done yet

    // Step 3: the Google step is now shown (not the dashboard)
    res = await call('/admin', { cookie });
    expect(await res.text()).toContain('Schritt 3 von 3');

    // Hard stop: submitting Google without a valid key keeps setup incomplete
    const bad = await call('/admin', { method: 'POST', cookie, body: form({ action: 'setup_google', subject: 'admin@id.x.at', domain: 'x.at', sa_key: 'not-json' }) });
    expect(bad.status).toBe(400);
    expect(await bad.text()).toContain('Service-Account-JSON');
    expect(await setting('setup_completed')).toBe('0'); // still blocked

    // Valid key + successful connection test -> setup completes
    mockGoogleOk();
    res = await call('/admin', { method: 'POST', cookie, body: form({ action: 'setup_google', subject: 'admin@id.x.at', domain: 'x.at', sa_key: SA_KEY }) });
    expect(res.status).toBe(303);
    expect(res.headers.get('location')).toContain('/admin');
    expect(await setting('setup_completed')).toBe('1');
    expect(await setting('google_sa_key_enc')).toBeTruthy(); // key stored
    expect(await env.DB.prepare('SELECT COUNT(*) AS c FROM trainers').first().then(r => r.c)).toBe(0); // no workshop until "start"

    // Dashboard now shown (setup done)
    res = await call('/admin', { cookie });
    const dash = await res.text();
    expect(dash).not.toContain('Schritt 3 von 3');
    expect(dash).toContain('Workshop starten');
    expect(dash).toContain('Admin – workshopmail');

    // Start the workshop -> fresh rotating link
    res = await call('/admin', { method: 'POST', cookie, body: form({ action: 'activate' }) });
    expect(res.status).toBe(303);
    const linkToken = await setting('default_workshop_token');
    expect(linkToken).toMatch(/^[a-z]+[0-9]{4}-[a-z0-9]{3}$/);
    res = await call('/admin', { cookie });
    const dash2 = await res.text();
    expect(dash2).toContain('Workshop stoppen');
    expect(dash2).toContain('Workshop läuft');
    expect(dash2).toContain('/?t=' + linkToken);

    // Legal pages are de-personalized: operator's own data, no foreign registry numbers
    const imp = await call('/impressum').then(r => r.text());
    expect(imp).toContain('workshopmail');
    expect(imp).toContain('Muster GmbH');
    expect(imp).toContain('Inhaber: Maria Muster');
    expect(imp).toContain('4020 Linz');
    expect(imp).not.toContain('33320410');
    expect(imp).not.toContain('malziland');
    expect(imp).toContain('powered by malziMAIL');
    const agb = await call('/nutzungsbedingungen').then(r => r.text());
    expect(agb).toContain('workshopmail');
    expect(agb).not.toContain('ATU76410108');
  });
});

describe('live-instance safety (legacy COCKPIT_PASSWORD present)', () => {
  it('never shows the setup assistant, shows the normal login instead', async () => {
    const res = await call('/admin', {}, { COCKPIT_PASSWORD: 'live-secret' });
    const html = await res.text();
    expect(html).not.toContain('Passwort festlegen');
    expect(html).toContain('Anmelden');
  });

  it('footer reads "powered by malziland" when no operator is configured', async () => {
    const imp = await call('/impressum').then(r => r.text());
    expect(imp).toContain('powered by malziland');
    expect(imp).not.toContain('powered by malziMAIL');
  });
});

// Covers the Google-provisioning paths of createAddress() and the scheduled()
// Google cleanup — with a real in-test RSA key (so the JWT signs) + mocked fetch.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import worker from '../../src/index.js';

let SA_KEY;
beforeAll(async () => {
  const kp = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify'],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  let bin = ''; for (let i = 0; i < pkcs8.length; i++) bin += String.fromCharCode(pkcs8[i]);
  const pem = '-----BEGIN PRIVATE KEY-----\n' + btoa(bin).match(/.{1,64}/g).join('\n') + '\n-----END PRIVATE KEY-----\n'; // gitleaks:allow — RSA key generated at runtime, not a real secret
  SA_KEY = JSON.stringify({ client_email: 'robot@x.iam.gserviceaccount.com', private_key: pem });
});
beforeEach(async () => {
  for (const t of ['settings', 'trainers', 'addresses', 'messages']) await env.DB.exec('DELETE FROM ' + t);
});
afterEach(() => vi.unstubAllGlobals());

const GENV = () => ({ ...env, MAIL_ENCRYPTION_KEY: 'k', GOOGLE_SA_KEY: SA_KEY, GOOGLE_ADMIN_SUBJECT: 'admin@x.at', GOOGLE_ACCOUNT_DOMAIN: 'x.at' });
const tokenResp = () => new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
function mockGoogle(onCreate, onDelete = () => new Response(null, { status: 204 })) {
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
    url = String(url);
    if (url.includes('oauth2.googleapis.com/token')) return tokenResp();
    if (opts.method === 'DELETE') return onDelete();
    if (opts.method === 'POST') return onCreate();
    return new Response(JSON.stringify({ users: [] }), { status: 200 });
  }));
}
async function newAddress() {
  const req = new Request('https://example.test/api/address', { method: 'POST', headers: { 'x-trainer-token': 'kurs' } });
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, GENV(), ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
async function seedRunning() {
  await env.DB.prepare('INSERT INTO trainers (token, name, secret_hash, active_until, enabled, created_at, google_enabled) VALUES (?, ?, 0, ?, 1, 0, 1)')
    .bind('kurs', 'Kurs', Date.now() + 3_600_000).run();
}

describe('createAddress — Google provisioning', () => {
  it('returns a Google login on success and stores the encrypted password', async () => {
    await seedRunning();
    mockGoogle(() => new Response(JSON.stringify({ primaryEmail: 'ignored@x.at', id: '1' }), { status: 200 }));
    const res = await newAddress();
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.google.login).toMatch(/^[a-z]+\d+@x\.at$/); // login = generated address @ the Google domain
    expect(j.google.password).toBeTruthy();
    const row = await env.DB.prepare('SELECT google_password_enc FROM addresses WHERE google_login IS NOT NULL').first();
    expect(row.google_password_enc).toMatch(/^ENC2:/); // password encrypted at rest
  });

  it('on a generic Google error keeps the mail address and reports google_status error', async () => {
    await seedRunning();
    mockGoogle(() => new Response(JSON.stringify({ error: { message: 'backend error' } }), { status: 500 }));
    const j = await (await newAddress()).json();
    expect(j.address).toBeTruthy();        // mail address still works
    expect(j.google_status).toBe('error'); // UI told why the Google login is missing
  });

  it('reports google_status "limit" when Google signals an account cap', async () => {
    await seedRunning();
    mockGoogle(() => new Response(JSON.stringify({ error: { message: 'user limit exceeded' } }), { status: 412 }));
    const j = await (await newAddress()).json();
    expect(j.google_status).toBe('limit');
  });
});

describe('scheduled — Google cleanup', () => {
  it('deletes the Google account of an expired address and clears its login', async () => {
    await env.DB.prepare("INSERT INTO addresses (address, created_at, expires_at, trainer_token, google_login) VALUES ('old@x.at', 0, 1, 'kurs', 'old@x.at')").run();
    let deleted = 0;
    mockGoogle(() => new Response('{}', { status: 200 }), () => { deleted++; return new Response(null, { status: 204 }); });
    const ctx = createExecutionContext();
    await worker.scheduled({}, GENV(), ctx);
    await waitOnExecutionContext(ctx);
    expect(deleted).toBe(1);
    const row = await env.DB.prepare("SELECT google_login FROM addresses WHERE address='old@x.at'").first();
    expect(row.google_login).toBeNull();
  });
});

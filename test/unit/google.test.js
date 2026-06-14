// src/lib/google.js — the Admin-SDK calls (JWT signing + token + create/delete/list).
// Uses a REAL RSA key generated in-test (so the JWT signs) and a mocked fetch,
// so the network paths get covered without touching Google.
import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';
import {
  googleConfig, createGoogleUser, deleteGoogleUser, deleteGoogleUsers, testGoogleConnection,
} from '../../src/lib/google.js';

async function fakeSaKeyJson() {
  const kp = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true, ['sign', 'verify'],
  );
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  let bin = '';
  for (let i = 0; i < pkcs8.length; i++) bin += String.fromCharCode(pkcs8[i]);
  const pem = '-----BEGIN PRIVATE KEY-----\n' + btoa(bin).match(/.{1,64}/g).join('\n') + '\n-----END PRIVATE KEY-----\n';
  return JSON.stringify({ client_email: 'robot@x.iam.gserviceaccount.com', private_key: pem });
}

let cfg;
beforeEach(async () => {
  cfg = googleConfig({ GOOGLE_SA_KEY: await fakeSaKeyJson(), GOOGLE_ADMIN_SUBJECT: 'admin@x.at', GOOGLE_ACCOUNT_DOMAIN: 'x.at' });
  expect(cfg).toBeTruthy();
});
afterEach(() => vi.unstubAllGlobals());

function mockFetch(handler) {
  vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => handler(String(url), opts)));
}
const tokenOk = (url) => url.includes('oauth2.googleapis.com/token')
  ? new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 }) : null;

describe('lib/google.js — Admin SDK paths (mocked fetch)', () => {
  it('createGoogleUser signs a JWT, gets a token, and creates the user', async () => {
    mockFetch((url, opts) => tokenOk(url)
      || (opts.method === 'POST' ? new Response(JSON.stringify({ primaryEmail: 'a@x.at', id: '42' }), { status: 200 }) : new Response('{}', { status: 200 })));
    expect(await createGoogleUser(cfg, 'a', 'a')).toBe('a@x.at');
  });

  it('createGoogleUser throws with status on a 409 (name taken)', async () => {
    mockFetch((url, opts) => tokenOk(url)
      || (opts.method === 'POST' ? new Response(JSON.stringify({ error: { message: 'Entity already exists' } }), { status: 409 }) : new Response('{}', { status: 200 })));
    await expect(createGoogleUser(cfg, 'a', 'a')).rejects.toMatchObject({ status: 409 });
  });

  it('deleteGoogleUser returns true on 204 and on 404 (already gone)', async () => {
    mockFetch((url) => tokenOk(url) || new Response(null, { status: 204 }));
    expect(await deleteGoogleUser(cfg, 'a@x.at')).toBe(true);
    mockFetch((url) => tokenOk(url) || new Response('', { status: 404 }));
    expect(await deleteGoogleUser(cfg, 'gone@x.at')).toBe(true);
  });

  it('deleteGoogleUsers uses one token and reports per-email outcomes', async () => {
    mockFetch((url) => tokenOk(url) || new Response(null, { status: 204 }));
    const out = await deleteGoogleUsers(cfg, ['a@x.at', 'b@x.at']);
    expect(out).toEqual([{ email: 'a@x.at', ok: true }, { email: 'b@x.at', ok: true }]);
  });

  it('testGoogleConnection returns ok on a successful users.list', async () => {
    mockFetch((url) => tokenOk(url) || new Response(JSON.stringify({ users: [] }), { status: 200 }));
    expect(await testGoogleConnection(cfg)).toEqual({ ok: true });
  });

  it('testGoogleConnection reports the failure step on a token error', async () => {
    mockFetch((url) => url.includes('/token') ? new Response('nope', { status: 401 }) : new Response('{}', { status: 200 }));
    const r = await testGoogleConnection(cfg);
    expect(r.ok).toBe(false);
    expect(r.step).toBe('token');
  });
});

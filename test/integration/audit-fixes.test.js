// Regression tests for the 2026-07-14 audit fixes (runtime findings):
//  #2  "stop" is local-first and survives a Google outage
//  #3  admin-login IP throttle rows are not retained
//  #5  message retention follows ttlHours instead of a fixed 48h
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import worker from '../../src/index.js';
import { wipeAllSessions } from '../../src/domain/google.js';

const HOUR = 3600 * 1000;

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

// Drive the real admin "stop" action end-to-end (login -> POST action=stop).
async function adminStop(envObj) {
  const login = new Request('https://example.test/admin', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'password=live-secret',
  });
  const c1 = createExecutionContext();
  const lr = await worker.fetch(login, envObj, c1);
  await waitOnExecutionContext(c1);
  const cookie = (lr.headers.get('set-cookie') || '').split(';')[0];
  const stop = new Request('https://example.test/admin', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
    body: 'action=stop',
  });
  const c2 = createExecutionContext();
  const sr = await worker.fetch(stop, envObj, c2);
  await waitOnExecutionContext(c2);
  return sr;
}

async function seedWorkshopWithGoogleAddress() {
  const now = Date.now();
  await env.DB.prepare('INSERT INTO trainers (token, name, secret_hash, active_until, enabled, created_at, google_enabled) VALUES (?, ?, 0, ?, 1, 0, 1)')
    .bind('kurs', 'Kurs', now + HOUR).run();
  await env.DB.prepare("INSERT INTO addresses (address, created_at, expires_at, trainer_token, google_login) VALUES ('a@x.at', 0, ?, 'kurs', 'a@x.at')").bind(now + HOUR).run();
}

describe('#2 admin "stop" action, end-to-end', () => {
  it('reports success and deactivates the workshop when Google is reachable', async () => {
    await seedWorkshopWithGoogleAddress();
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
      if (String(url).includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
      if (opts.method === 'DELETE') return new Response(null, { status: 204 });
      return new Response('{}', { status: 200 });
    }));
    const res = await adminStop({ ...GENV(), COCKPIT_PASSWORD: 'live-secret' });
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.googleError).toBe(false);
    expect(j.deleted).toBe(1);
    const t = await env.DB.prepare("SELECT active_until FROM trainers WHERE token='kurs'").first();
    expect(t.active_until).toBe(0); // link killed
  });

  it('still stops (and says so) when Google is unreachable', async () => {
    await seedWorkshopWithGoogleAddress();
    vi.stubGlobal('fetch', vi.fn(async (url) =>
      String(url).includes('oauth2.googleapis.com/token')
        ? new Response('err', { status: 500 })
        : new Response('{}', { status: 200 })));
    const res = await adminStop({ ...GENV(), COCKPIT_PASSWORD: 'live-secret' });
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.googleError).toBe(true);
    expect(j.message).toMatch(/Google war nicht erreichbar/);
    const t = await env.DB.prepare("SELECT active_until FROM trainers WHERE token='kurs'").first();
    expect(t.active_until).toBe(0); // link still killed despite the Google outage
  });
});

describe('#2 stop/wipe is local-first and survives a Google outage', () => {
  it('empties mailboxes + retires addresses even when the Google token cannot be fetched', async () => {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO addresses (address, created_at, expires_at, trainer_token, google_login) VALUES ('a@x.at', 0, ?, 'kurs', 'a@x.at')").bind(now + HOUR).run();
    await env.DB.prepare("INSERT INTO messages (to_addr, from_addr, subject, received_at) VALUES ('a@x.at','s','m', ?)").bind(now).run();

    // Google is down: the OAuth token endpoint returns 500 -> getAccessToken throws.
    vi.stubGlobal('fetch', vi.fn(async (url) =>
      String(url).includes('oauth2.googleapis.com/token')
        ? new Response('err', { status: 500 })
        : new Response('{}', { status: 200 })));

    const res = await wipeAllSessions(GENV());

    expect(res.googleError).toBe(true);            // Google side failed...
    // ...but the local wipe still ran:
    const msgs = await env.DB.prepare("SELECT COUNT(*) AS c FROM messages WHERE to_addr='a@x.at'").first();
    expect(msgs.c).toBe(0);                         // mailbox emptied
    const addr = await env.DB.prepare("SELECT expires_at, google_login FROM addresses WHERE address='a@x.at'").first();
    expect(addr.expires_at).toBe(0);                // address retired -> link dead
    expect(addr.google_login).toBe('a@x.at');       // login kept so the cron retries the Google delete
  });

  it('counts an account as failed (kept for retry) when Google rejects the delete', async () => {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO addresses (address, created_at, expires_at, trainer_token, google_login) VALUES ('b@x.at', 0, ?, 'kurs', 'b@x.at')").bind(now + HOUR).run();
    vi.stubGlobal('fetch', vi.fn(async (url, opts = {}) => {
      if (String(url).includes('oauth2.googleapis.com/token')) return new Response(JSON.stringify({ access_token: 'tok' }), { status: 200 });
      if (opts.method === 'DELETE') return new Response('nope', { status: 500 }); // rejected, not thrown
      return new Response('{}', { status: 200 });
    }));
    const res = await wipeAllSessions(GENV());
    expect(res.googleError).toBe(false); // no exception -> not an outage
    expect(res.failed).toBe(1);          // but the delete was not confirmed
    const addr = await env.DB.prepare("SELECT google_login FROM addresses WHERE address='b@x.at'").first();
    expect(addr.google_login).toBe('b@x.at'); // kept so the cron retries
  });
});

describe('#3 admin-login IP throttle rows are not retained', () => {
  it('a successful login clears its own throttle row (no IP left behind)', async () => {
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('loginguard:9.9.9.9','3:0', ?)").bind(Date.now()).run();
    const req = new Request('https://example.test/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'cf-connecting-ip': '9.9.9.9' },
      body: 'password=live-secret',
    });
    const ctx = createExecutionContext();
    await worker.fetch(req, { ...env, COCKPIT_PASSWORD: 'live-secret', MAIL_ENCRYPTION_KEY: 'k' }, ctx);
    await waitOnExecutionContext(ctx);
    expect(await env.DB.prepare("SELECT value FROM settings WHERE key='loginguard:9.9.9.9'").first()).toBeNull();
  });

  it('the cron purges stale throttle rows and keeps fresh ones', async () => {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('loginguard:1.1.1.1','1:0', ?)").bind(now - 2 * HOUR).run();
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('loginguard:2.2.2.2','1:0', ?)").bind(now).run();
    const ctx = createExecutionContext();
    await worker.scheduled({}, { ...env, MAIL_ENCRYPTION_KEY: 'k' }, ctx);
    await waitOnExecutionContext(ctx);
    expect(await env.DB.prepare("SELECT value FROM settings WHERE key='loginguard:1.1.1.1'").first()).toBeNull();       // stale -> purged
    expect(await env.DB.prepare("SELECT value FROM settings WHERE key='loginguard:2.2.2.2'").first()).not.toBeNull();   // fresh -> kept
  });
});

describe('#5 retention follows ttlHours, not a fixed 48h', () => {
  it('keeps a 50h-old mail of an active address once ttl is raised to 72h', async () => {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO settings (key, value, updated_at) VALUES ('address_ttl_hours','72', ?)").bind(now).run();
    await env.DB.prepare("INSERT INTO addresses (address, created_at, expires_at, trainer_token) VALUES ('live@x', 0, ?, 'kurs')").bind(now + HOUR).run();
    await env.DB.prepare("INSERT INTO messages (to_addr, from_addr, subject, received_at) VALUES ('live@x','s','still-valid', ?)").bind(now - 50 * HOUR).run();
    const ctx = createExecutionContext();
    await worker.scheduled({}, { ...env, MAIL_ENCRYPTION_KEY: 'k' }, ctx);
    await waitOnExecutionContext(ctx);
    // With the old fixed-48h cutoff this mail would be gone; under ttl=72h it survives.
    const c = await env.DB.prepare("SELECT COUNT(*) AS c FROM messages WHERE to_addr='live@x'").first();
    expect(c.c).toBe(1);
  });
});

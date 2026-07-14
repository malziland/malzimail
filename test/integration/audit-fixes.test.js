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
  const pem = '-----BEGIN PRIVATE KEY-----\n' + btoa(bin).match(/.{1,64}/g).join('\n') + '\n-----END PRIVATE KEY-----\n';
  SA_KEY = JSON.stringify({ client_email: 'robot@x.iam.gserviceaccount.com', private_key: pem });
});
beforeEach(async () => {
  for (const t of ['settings', 'trainers', 'addresses', 'messages']) await env.DB.exec('DELETE FROM ' + t);
});
afterEach(() => vi.unstubAllGlobals());

const GENV = () => ({ ...env, MAIL_ENCRYPTION_KEY: 'k', GOOGLE_SA_KEY: SA_KEY, GOOGLE_ADMIN_SUBJECT: 'admin@x.at', GOOGLE_ACCOUNT_DOMAIN: 'x.at' });

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

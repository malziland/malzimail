// Redesign R1: "start" mints a fresh rotating participant link (no token input,
// no fixed runtime — runs until "stop"); "stop" wipes everything and kills the link.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import {beforeEach, describe, it, expect} from 'vitest';
import worker from '../../src/index.js';

beforeEach(async () => {
  for (const t of ['settings', 'trainers', 'addresses', 'messages']) await env.DB.exec('DELETE FROM ' + t);
});

const ORIGIN = 'https://example.test';
const EXTRA = { COCKPIT_PASSWORD: 'live-secret', MAIL_ENCRYPTION_KEY: 'k' };
const form = (o) => new URLSearchParams(o).toString();
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
async function login() {
  const res = await call('/admin', { method: 'POST', body: form({ password: 'live-secret' }) });
  return (res.headers.get('set-cookie') || '').split(';')[0];
}
const TOKEN_RE = /^[a-z]+[0-9]{4}-[a-z0-9]{3}$/;
const defaultToken = () => env.DB.prepare("SELECT value FROM settings WHERE key='default_workshop_token'").first().then((r) => r && r.value);

describe('start mints a fresh rotating link', () => {
  it('activate creates a new always-on workshop with an animal token', async () => {
    const cookie = await login();
    const res = await call('/admin', { method: 'POST', cookie, body: form({ action: 'activate' }) });
    expect(res.status).toBe(303);
    const token = await defaultToken();
    expect(token).toMatch(TOKEN_RE);
    const row = await env.DB.prepare('SELECT active_until, enabled FROM trainers WHERE token = ?').bind(token).first();
    expect(row.enabled).toBe(1);
    expect(row.active_until).toBeGreaterThan(Date.now() + 365 * 24 * 3600 * 1000); // "always on"
  });

  it('a second start rotates to a different token and deactivates the previous one', async () => {
    const cookie = await login();
    await call('/admin', { method: 'POST', cookie, body: form({ action: 'activate' }) });
    const first = await defaultToken();
    await call('/admin', { method: 'POST', cookie, body: form({ action: 'activate' }) });
    const second = await defaultToken();
    expect(second).not.toBe(first);
    const old = await env.DB.prepare('SELECT active_until FROM trainers WHERE token = ?').bind(first).first();
    expect(old.active_until).toBe(0); // previous link is dead
  });
});

describe('stop wipes everything and kills the link', () => {
  it('deletes mailboxes/accounts, retires addresses and zeroes the link', async () => {
    const cookie = await login();
    await call('/admin', { method: 'POST', cookie, body: form({ action: 'activate' }) });
    const token = await defaultToken();
    // a live session with a message
    const future = Date.now() + 3_600_000;
    await env.DB.prepare("INSERT INTO addresses (address, created_at, expires_at, trainer_token, google_login) VALUES ('p@x', 0, ?, ?, NULL)").bind(future, token).run();
    await env.DB.prepare("INSERT INTO messages (to_addr, from_addr, subject, received_at) VALUES ('p@x','s@x','hi',1)").run();

    const res = await call('/admin', { method: 'POST', cookie, body: form({ action: 'stop' }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.reset).toBe(1);

    expect(await env.DB.prepare('SELECT active_until FROM trainers WHERE token = ?').bind(token).first().then((r) => r.active_until)).toBe(0);
    expect(await env.DB.prepare("SELECT expires_at FROM addresses WHERE address='p@x'").first().then((r) => r.expires_at)).toBe(0);
    expect(await env.DB.prepare("SELECT COUNT(*) AS c FROM messages WHERE to_addr='p@x'").first().then((r) => r.c)).toBe(0);
  });
});

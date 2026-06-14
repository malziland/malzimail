// Full coverage of the participant JSON API: address minting (no-Google path +
// guards/limits), status, message read, export, QR, and unknown routes.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import {beforeEach, describe, it, expect} from 'vitest';
import worker from '../../src/index.js';

beforeEach(async () => {
  for (const t of ['settings', 'trainers', 'addresses', 'messages']) await env.DB.exec('DELETE FROM ' + t);
});

const ENV = { ...env, MAIL_ENCRYPTION_KEY: 'k' }; // no GOOGLE_* -> the classic no-Google path
async function call(path, { method = 'GET', headers = {} } = {}) {
  const req = new Request('https://example.test' + path, { method, headers });
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, ENV, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
async function runningTrainer(extra = {}) {
  await env.DB.prepare('INSERT INTO trainers (token, name, secret_hash, active_until, enabled, created_at, daily_gen_limit, daily_used_limit, google_enabled) VALUES (?, ?, 0, ?, 1, 0, ?, ?, 0)')
    .bind('kurs', 'Kurs', Date.now() + 3_600_000, extra.gen ?? null, extra.used ?? null).run();
}
async function seedAddress(addr, { expires = Date.now() + 3_600_000, first = null } = {}) {
  await env.DB.prepare('INSERT INTO addresses (address, created_at, expires_at, trainer_token, first_mail_at) VALUES (?, ?, ?, ?, ?)')
    .bind(addr, Date.now(), expires, 'kurs', first).run();
}

describe('/api/address (minting + guards)', () => {
  it('mints a random address (no Google configured)', async () => {
    await runningTrainer();
    const res = await call('/api/address', { method: 'POST', headers: { 'x-trainer-token': 'kurs' } });
    expect(res.status).toBe(200);
    const j = await res.json();
    expect(j.address).toMatch(/@/);
    expect(j.google).toBeUndefined();
  });
  it('401 without a token', async () => {
    expect((await call('/api/address', { method: 'POST' })).status).toBe(401);
  });
  it('403 for an unknown token', async () => {
    expect((await call('/api/address', { method: 'POST', headers: { 'x-trainer-token': 'nope' } })).status).toBe(403);
  });
  it('403 when the workshop is stopped', async () => {
    await env.DB.prepare('INSERT INTO trainers (token, name, secret_hash, active_until, enabled, created_at, google_enabled) VALUES (?, ?, 0, 0, 1, 0, 0)').bind('kurs', 'K').run();
    expect((await call('/api/address', { method: 'POST', headers: { 'x-trainer-token': 'kurs' } })).status).toBe(403);
  });
  it('429 when the daily generation limit is reached', async () => {
    await runningTrainer({ gen: 1 });
    await seedAddress('a@x'); // counts as 1 generated today
    const j = await call('/api/address', { method: 'POST', headers: { 'x-trainer-token': 'kurs' } }).then((r) => r.json());
    expect(j.error).toBe('bot_limit_reached');
  });
  it('429 when the daily used limit is reached', async () => {
    await runningTrainer({ used: 1 });
    await seedAddress('a@x', { first: Date.now() }); // counts as 1 used today
    const res = await call('/api/address', { method: 'POST', headers: { 'x-trainer-token': 'kurs' } });
    expect(res.status).toBe(429);
    expect(await res.json().then((j) => j.error)).toBe('quota_reached');
  });
});

describe('MAIL_DOMAIN — Self-Hosting (kein stiller Fremd-Domain-Fallback)', () => {
  async function mintWith(envOverrides) {
    await runningTrainer();
    const req = new Request('https://example.test/api/address', { method: 'POST', headers: { 'x-trainer-token': 'kurs' } });
    const ctx = createExecutionContext();
    const res = await worker.fetch(req, { ...env, MAIL_ENCRYPTION_KEY: 'k', ...envOverrides }, ctx);
    await waitOnExecutionContext(ctx);
    return res;
  }
  it('mints addresses on the CONFIGURED domain, never a hardcoded foreign one', async () => {
    const j = await mintWith({ MAIL_DOMAIN: 'meine-domain.test' }).then((r) => r.json());
    expect(j.address).toMatch(/@meine-domain\.test$/);
    expect(j.address).not.toContain('malzimail.at');
  });
  it('fails loud (500 misconfigured) when MAIL_DOMAIN is missing — no silent fallback', async () => {
    const res = await mintWith({ MAIL_DOMAIN: undefined });
    expect(res.status).toBe(500);
    expect(await res.json().then((j) => j.error)).toBe('misconfigured');
  });
});

describe('/api/address/status', () => {
  it('reports active for a live address, 404 for unknown, 400 without ?to', async () => {
    await runningTrainer(); await seedAddress('a@x');
    expect(await call('/api/address/status?to=a@x').then((r) => r.json()).then((j) => j.active)).toBe(true);
    expect((await call('/api/address/status?to=ghost@x')).status).toBe(404);
    expect((await call('/api/address/status')).status).toBe(400);
  });
});

describe('/api/messages + /api/message/:id', () => {
  it('lists and reads a message for the owning token', async () => {
    await runningTrainer(); await seedAddress('a@x');
    const ins = await env.DB.prepare("INSERT INTO messages (to_addr, from_addr, subject, text_body, received_at) VALUES ('a@x','s@x','Hallo','Text', 5)").run();
    const id = ins.meta.last_row_id;
    const list = await call('/api/messages?to=a@x&t=kurs').then((r) => r.json());
    expect(list.messages.map((m) => m.subject)).toContain('Hallo');
    const msg = await call('/api/message/' + id + '?to=a@x&t=kurs').then((r) => r.json());
    expect(msg.subject).toBe('Hallo');
    expect(msg.text_body).toBe('Text');
  });
  it('410 reading a message of an expired address', async () => {
    await runningTrainer(); await seedAddress('old@x', { expires: Date.now() - 1000 });
    expect((await call('/api/message/1?to=old@x&t=kurs')).status).toBe(410);
  });
});

describe('/api/message/:id/frame — isolated email document', () => {
  it('serves the mail HTML with its OWN CSP: scripts blocked, inline styles kept, same-origin framable', async () => {
    await runningTrainer(); await seedAddress('a@x');
    const ins = await env.DB.prepare(
      "INSERT INTO messages (to_addr, from_addr, subject, html_body, received_at) VALUES ('a@x','s@x','S','<div style=\"color:red\">hi</div>', 5)"
    ).run();
    const res = await call('/api/message/' + ins.meta.last_row_id + '/frame?to=a@x&t=kurs');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const csp = res.headers.get('content-security-policy');
    expect(csp).toContain("default-src 'none'");      // scripts blocked (no script-src directive)
    expect(csp).toContain("style-src 'unsafe-inline'"); // mail's own inline styles render
    expect(csp).not.toContain('script-src');
    expect(csp).toContain("frame-ancestors 'self'");
    expect(res.headers.get('x-frame-options')).toBe('SAMEORIGIN'); // NOT DENY -> our iframe can load it
    expect(await res.text()).toContain('color:red');    // inline style survives into the document
  });
  it('denies a non-owning token (403) and gates expiry (410)', async () => {
    await runningTrainer();
    await seedAddress('a@x');
    await env.DB.prepare("INSERT INTO messages (to_addr, from_addr, subject, html_body, received_at) VALUES ('a@x','s@x','S','<b>x</b>', 5)").run();
    expect((await call('/api/message/1/frame?to=a@x&t=wrong')).status).toBe(403);
    await seedAddress('old@x', { expires: Date.now() - 1000 });
    expect((await call('/api/message/1/frame?to=old@x&t=kurs')).status).toBe(410);
  });
});

describe('/api/export', () => {
  it('downloads all messages as JSON for the owning token', async () => {
    await runningTrainer(); await seedAddress('a@x');
    await env.DB.prepare("INSERT INTO messages (to_addr, from_addr, subject, received_at) VALUES ('a@x','s@x','M1', 1)").run();
    const res = await call('/api/export?to=a@x&t=kurs');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-disposition')).toMatch(/attachment/);
    const j = await res.json();
    expect(j.message_count).toBe(1);
  });
});

describe('/api/qr + routing', () => {
  it('renders an SVG, 400 on empty text, 404 on an unknown api route', async () => {
    const svg = await call('/api/qr?text=hallo');
    expect(svg.headers.get('content-type')).toMatch(/svg/);
    expect((await call('/api/qr?text=')).status).toBe(400);
    expect((await call('/api/unknown')).status).toBe(404);
  });
});

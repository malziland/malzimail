// UI-profile evidence (ADR-0001): ONE uninterrupted end-to-end run of the most
// critical user flow through the real worker — the participant opens the
// workshop link, mints an address, a real mail arrives via worker.email()
// (encrypted at rest), and the participant reads it back (list, detail,
// isolated frame, export). No message rows are seeded directly: every step
// goes through a real worker entry point.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { beforeEach, describe, it, expect } from 'vitest';
import worker from '../../src/index.js';

const ENV = { ...env, MAIL_ENCRYPTION_KEY: 'e2e-key', GOOGLE_SA_KEY: undefined };

async function call(path, init = {}) {
  const req = new Request('https://example.test' + path, init);
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, ENV, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

beforeEach(async () => {
  for (const t of ['settings', 'trainers', 'addresses', 'messages']) await env.DB.exec('DELETE FROM ' + t);
  await env.DB.prepare('INSERT INTO trainers (token, name, secret_hash, active_until, enabled, created_at, google_enabled) VALUES (?, ?, 0, ?, 1, 0, 0)')
    .bind('kurs', 'Kurs', Date.now() + 3_600_000).run();
});

describe('E2E participant flow: link -> mint -> receive -> read -> export', () => {
  it('walks the whole chain through real worker entry points', async () => {
    // 1. Opening the workshop link starts a participant session.
    const page = await call('/?t=kurs');
    expect(page.status).toBe(200);
    expect(page.headers.get('set-cookie') || '').toMatch(/mzm_t=kurs/);

    // 2. The participant mints a disposable address.
    const mint = await call('/api/address', { method: 'POST', headers: { 'x-trainer-token': 'kurs' } });
    expect(mint.status).toBe(200);
    const { address } = await mint.json();
    expect(address).toMatch(/@/);

    // 3. A real mail arrives for exactly that address via the email() entry point.
    const ctx = createExecutionContext();
    await worker.email({
      to: address,
      from: 'sender@example.com',
      raw: `From: sender@example.com\r\nTo: ${address}\r\nSubject: Willkommen\r\n\r\nHallo Workshop`,
      rawSize: 80,
    }, ENV, ctx);
    await waitOnExecutionContext(ctx);

    // ... and is encrypted at rest.
    const row = await env.DB.prepare('SELECT subject FROM messages WHERE to_addr = ?').bind(address).first();
    expect(row.subject).toMatch(/^ENC2:/);

    // 4. The owner lists and reads it back decrypted.
    const to = encodeURIComponent(address);
    const list = await call(`/api/messages?to=${to}&t=kurs`).then((r) => r.json());
    expect(list.messages).toHaveLength(1);
    expect(list.messages[0].subject).toBe('Willkommen');
    const id = list.messages[0].id;
    const msg = await call(`/api/message/${id}?to=${to}&t=kurs`).then((r) => r.json());
    expect(msg.text_body).toContain('Hallo Workshop');

    // 5. Isolated frame and export complete the flow.
    expect((await call(`/api/message/${id}/frame?to=${to}&t=kurs`)).status).toBe(200);
    const exported = await call(`/api/export?to=${to}&t=kurs`).then((r) => r.json());
    expect(exported.message_count).toBe(1);
  });
});

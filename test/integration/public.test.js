// handleRoot (participant entry routing in src/routes/public.js): which page a
// visitor gets and whether the workshop session cookie (mzm_t) is set.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import {beforeEach, describe, it, expect} from 'vitest';
import worker from '../../src/index.js';

beforeEach(async () => { await env.DB.exec('DELETE FROM trainers'); });

async function get(path, cookie) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  const req = new Request('https://example.test' + path, { headers });
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, { ...env }, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}
const setCookie = (res) => res.headers.get('set-cookie') || '';
async function seedTrainer(token, activeUntil, enabled = 1) {
  await env.DB.prepare('INSERT INTO trainers (token, name, secret_hash, active_until, enabled, created_at, google_enabled) VALUES (?, ?, 0, ?, ?, 0, 0)')
    .bind(token, token, activeUntil, enabled).run();
}

describe('handleRoot — participant entry routing', () => {
  it('no token -> landing page, no session cookie', async () => {
    expect(setCookie(await get('/'))).not.toMatch(/mzm_t=/);
  });

  it('active workshop link (?t=) -> sets the mzm_t session cookie', async () => {
    await seedTrainer('kurs', Date.now() + 3_600_000);
    expect(setCookie(await get('/?t=kurs'))).toMatch(/mzm_t=kurs/);
  });

  it('stopped workshop (active_until=0) -> landing, no cookie', async () => {
    await seedTrainer('kurs', 0);
    expect(setCookie(await get('/?t=kurs'))).not.toMatch(/mzm_t=/);
  });

  it('disabled workshop -> landing, no cookie', async () => {
    await seedTrainer('kurs', Date.now() + 3_600_000, 0);
    expect(setCookie(await get('/?t=kurs'))).not.toMatch(/mzm_t=/);
  });

  it('unknown token -> landing, no cookie', async () => {
    expect(setCookie(await get('/?t=gibtsnicht'))).not.toMatch(/mzm_t=/);
  });

  it('returning visitor via the mzm_t cookie (no ?t) -> handled, no error', async () => {
    await seedTrainer('kurs', Date.now() + 3_600_000);
    const res = await get('/', 'mzm_t=kurs');
    expect(res.status).not.toBe(500);
    expect(setCookie(res)).not.toMatch(/mzm_t=/); // cookie only (re)set when ?t is present
  });
});

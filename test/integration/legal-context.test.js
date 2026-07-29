// getLegalContext() itself, rather than the rendered pages: the partially filled
// operator record. A self-hoster can finish the setup assistant with only the
// mandatory fields, so every optional field must degrade to '' instead of
// leaking `undefined` into the Impressum — and a missing MAIL_DOMAIN must show a
// visible marker rather than throw (that would take every legal page down).
import { env } from 'cloudflare:test';
import { beforeEach, describe, it, expect } from 'vitest';
import { getLegalContext } from '../../src/domain/legal.js';

beforeEach(async () => { await env.DB.exec('DELETE FROM settings'); });

async function set(key, value) {
  await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, 0)')
    .bind(key, value).run();
}

describe('getLegalContext', () => {
  it('reports configured:false while no operator has been captured', async () => {
    const ctx = await getLegalContext({ ...env, MAIL_DOMAIN: 'example.test' }, 'https://example.test');
    expect(ctx.configured).toBe(false);
    expect(ctx.mailDomain).toBe('example.test');
    expect(ctx.googleActive).toBe(false);
  });

  it('marks a missing MAIL_DOMAIN visibly instead of borrowing another domain', async () => {
    const ctx = await getLegalContext({ ...env, MAIL_DOMAIN: undefined });
    expect(ctx.mailDomain).toBe('NICHT-KONFIGURIERT.invalid');
    expect(ctx.origin).toBe(''); // origin defaults to empty when the caller omits it
  });

  it('fills every optional operator field with "" when only the owner is set', async () => {
    await set('operator_owner', 'Maria Muster');
    const ctx = await getLegalContext({ ...env, MAIL_DOMAIN: 'kurs.test' });
    expect(ctx.configured).toBe(true);
    expect(ctx.owner).toBe('Maria Muster');
    // Falls back to the mail domain, so the pages always have a service name.
    expect(ctx.serviceName).toBe('kurs.test');
    for (const field of ['company', 'street', 'zip', 'city', 'email', 'legalDate']) {
      expect(ctx[field]).toBe('');
    }
    expect(String(JSON.stringify(ctx))).not.toContain('undefined');
  });

  it('prefers the configured service name over the mail domain', async () => {
    await set('operator_owner', 'Maria Muster');
    await set('operator_service_name', 'kurspost');
    const ctx = await getLegalContext({ ...env, MAIL_DOMAIN: 'kurs.test' });
    expect(ctx.serviceName).toBe('kurspost');
  });
});

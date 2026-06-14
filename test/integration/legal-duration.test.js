// The legal pages quote the retention period from a single configurable source
// (ttlHours: setting 'address_ttl_hours' -> env -> default 24), so changing the
// duration later updates the legal copy automatically.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import {beforeEach, describe, it, expect} from 'vitest';
import worker from '../../src/index.js';

beforeEach(async () => {
  await env.DB.exec('DELETE FROM settings');
});

async function get(path, extraEnv = {}) {
  const req = new Request('https://example.test' + path);
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, { ...env, ...extraEnv }, ctx);
  await waitOnExecutionContext(ctx);
  return res.text();
}

describe('legal pages quote the configured retention duration', () => {
  it('defaults to 48 Stunden when nothing is set', async () => {
    const html = await get('/nutzungsbedingungen');
    expect(html).toContain('48 Stunden');
  });

  it('follows the address_ttl_hours setting', async () => {
    await env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, 0)')
      .bind('address_ttl_hours', '6').run();
    const agb = await get('/nutzungsbedingungen');
    expect(agb).toContain('6 Stunden');
    expect(agb).not.toContain('24 Stunden');
    // Datenschutz uses the same source.
    const ds = await get('/datenschutz');
    expect(ds).toContain('6 Stunden');
  });

  it('PRIV-04: names Google as a recipient only when Google is configured', async () => {
    const GKEY = JSON.stringify({
      client_email: 'r@x.iam.gserviceaccount.com',
      private_key: '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n',
    });
    expect(await get('/datenschutz')).not.toContain('Google LLC'); // no Google -> not named
    const withGoogle = await get('/datenschutz', {
      GOOGLE_SA_KEY: GKEY, GOOGLE_ADMIN_SUBJECT: 'admin@x', GOOGLE_ACCOUNT_DOMAIN: 'x.at', MAIL_ENCRYPTION_KEY: 'k',
    });
    expect(withGoogle).toContain('Google LLC');       // recipient row
    expect(withGoogle).toContain('Drittlandtransfer'); // third-country note
  });
});

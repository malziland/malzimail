// resolveGoogleConfig(): operator settings (service-account key encrypted at rest)
// take precedence over the Worker secret; an empty settings table keeps exactly the
// secret-based behaviour. This is what makes the Google config admin-configurable
// for OSS self-hosters without ever putting the private key in the DB in clear text.
import { env } from 'cloudflare:test';
import {beforeEach, describe, it, expect} from 'vitest';
import { resolveGoogleConfig } from '../../src/index.js';
import { makeCipher, cipherEncrypt } from '../../src/lib/crypto.js';
import { setSetting } from '../../src/domain/settings.js';

const VALID_KEY = JSON.stringify({
  client_email: 'robot@x.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n',
});

beforeEach(async () => {
  await env.DB.exec('DELETE FROM settings');
});

describe('resolveGoogleConfig precedence (encrypted settings -> secret -> none)', () => {
  it('falls back to the Worker secret/vars when no settings are stored', async () => {
    const cfg = await resolveGoogleConfig({
      ...env, GOOGLE_SA_KEY: VALID_KEY, GOOGLE_ADMIN_SUBJECT: 'admin@id.test', GOOGLE_ACCOUNT_DOMAIN: 'test',
    });
    expect(cfg).not.toBeNull();
    expect(cfg.subject).toBe('admin@id.test');
    expect(cfg.domain).toBe('test');
    expect(cfg.key.client_email).toBe('robot@x.iam.gserviceaccount.com');
  });

  it('returns null when nothing is configured', async () => {
    expect(await resolveGoogleConfig({ ...env })).toBeNull();
  });

  it('uses operator settings (encrypted key) over the secret', async () => {
    // Encrypt with the 'google' context — the same context resolveGoogleConfig reads with.
    const k = await makeCipher('test-mail-key-123', 'google');
    await setSetting({ ...env }, 'google_sa_key_enc', await cipherEncrypt(VALID_KEY, k));
    await setSetting({ ...env }, 'google_admin_subject', 'op@id.example');
    await setSetting({ ...env }, 'google_account_domain', 'example.at');
    const cfg = await resolveGoogleConfig({ ...env, MAIL_ENCRYPTION_KEY: 'test-mail-key-123', GOOGLE_SA_KEY: undefined });
    expect(cfg).not.toBeNull();
    expect(cfg.subject).toBe('op@id.example');
    expect(cfg.domain).toBe('example.at');
    expect(cfg.key.client_email).toBe('robot@x.iam.gserviceaccount.com');
  });
});

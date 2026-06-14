// Regression: Google provisioning must follow the Worker configuration
// (googleConfig present), NOT the legacy per-workshop `google_enabled` column.
// This is the bug that silently disabled Google on the live participant page:
// the admin showed "Google aktiv" (config present) while the server still gated
// on google_enabled=0, and the UI no longer exposed a way to flip it.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import {beforeEach, describe, it, expect} from 'vitest';
import worker from '../../src/index.js';


beforeEach(async () => {
  await env.DB.exec('DELETE FROM trainers');
  await env.DB.exec('DELETE FROM addresses');
  await env.DB.exec('DELETE FROM settings'); // resolveGoogleConfig must see no operator settings (use the env fallback)
  // Active workshop with the legacy Google flag explicitly OFF.
  await env.DB.prepare(
    'INSERT INTO trainers (token, name, secret_hash, secret_encrypted, daily_used_limit, daily_gen_limit, active_until, enabled, created_at, notes, google_enabled) ' +
    'VALUES (?, ?, ?, ?, NULL, NULL, ?, 1, ?, NULL, 0)',
  ).bind('kurs', 'Kurs', 'h', 'e', Date.now() + 3600_000, Date.now()).run();
});

async function newAddress(extraEnv) {
  const req = new Request('https://example.test/api/address', {
    method: 'POST',
    headers: { 'x-trainer-token': 'kurs' },
  });
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, { ...env, ...extraEnv }, ctx);
  await waitOnExecutionContext(ctx);
  return res.json();
}

// A structurally-valid SA key whose PEM can't actually sign — so createGoogleUser
// attempts Google and fails cleanly (proving it TRIED despite google_enabled=0).
const GOOGLE_ENV = {
  GOOGLE_SA_KEY: JSON.stringify({ client_email: 'x@y.iam.gserviceaccount.com', private_key: 'not-a-real-pem' }),
  GOOGLE_ADMIN_SUBJECT: 'admin@id.test',
  GOOGLE_ACCOUNT_DOMAIN: 'id.test',
  MAIL_ENCRYPTION_KEY: 'test-key-1234567890',
};

describe('address provisioning follows config, not the legacy google_enabled flag', () => {
  it('no Google config -> plain address, regardless of the flag', async () => {
    const data = await newAddress({
      GOOGLE_SA_KEY: undefined, GOOGLE_ADMIN_SUBJECT: undefined, GOOGLE_ACCOUNT_DOMAIN: undefined,
    });
    expect(data.address).toMatch(/@/);
    expect(data.google).toBeUndefined();
    expect(data.google_status).toBeUndefined();
  });

  it('caps the address expiry at the workshop end (no self-extension)', async () => {
    // beforeEach set the workshop to end in ~1h; the TTL default is 24h, so the
    // address must expire at the workshop end, never a fresh 24h.
    const data = await newAddress({
      GOOGLE_SA_KEY: undefined, GOOGLE_ADMIN_SUBJECT: undefined, GOOGLE_ACCOUNT_DOMAIN: undefined,
    });
    expect(data.expires_at).toBeGreaterThan(Date.now());                 // still active
    expect(data.expires_at).toBeLessThan(Date.now() + 2 * 3600_000);     // bounded by the ~1h window
  });

  it('Google config present -> attempts Google even though google_enabled=0', async () => {
    const data = await newAddress(GOOGLE_ENV);
    expect(data.address).toMatch(/@/);
    // It tried to provision (config present) and failed on the fake key ->
    // google_status is set. Before the fix, google_enabled=0 short-circuited to a
    // plain address and google_status would be undefined.
    expect(data.google_status).toBe('error');
  });
});

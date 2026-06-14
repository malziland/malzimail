// Integration tests for src/domain/settings.js against a real (local) D1 binding.
import { env } from 'cloudflare:test';
import {beforeEach, describe, it, expect} from 'vitest';
import {
  getSetting, setSetting, deleteSetting,
  resolveConfig,
} from '../../src/domain/settings.js';


beforeEach(async () => {
  await env.DB.exec('DELETE FROM settings');
});

describe('settings store', () => {
  it('returns null for a missing key', async () => {
    expect(await getSetting(env, 'nope')).toBeNull();
  });

  it('sets and reads a value', async () => {
    await setSetting(env, 'service_name', 'workshopmail');
    expect(await getSetting(env, 'service_name')).toBe('workshopmail');
  });

  it('upserts (overwrites) an existing key', async () => {
    await setSetting(env, 'k', 'v1');
    await setSetting(env, 'k', 'v2');
    expect(await getSetting(env, 'k')).toBe('v2');
  });

  it('deletes a key', async () => {
    await setSetting(env, 'k', 'v');
    await deleteSetting(env, 'k');
    expect(await getSetting(env, 'k')).toBeNull();
  });
});

describe('resolveConfig precedence (DB -> env/secret -> default)', () => {
  it('prefers the DB value over env and default', async () => {
    await setSetting(env, 'admin_password_hash', 'from-db');
    const e = { ...env, COCKPIT_PASSWORD: 'from-env' };
    expect(await resolveConfig(e, 'admin_password_hash', 'COCKPIT_PASSWORD', 'def')).toBe('from-db');
  });

  it('falls back to the env/secret when DB is empty (today\'s live behavior)', async () => {
    const e = { ...env, COCKPIT_PASSWORD: 'from-env' };
    expect(await resolveConfig(e, 'admin_password_hash', 'COCKPIT_PASSWORD', 'def')).toBe('from-env');
  });

  it('falls back to the default when DB and env are both empty', async () => {
    expect(await resolveConfig(env, 'missing', 'NOPE', 'def')).toBe('def');
  });
});

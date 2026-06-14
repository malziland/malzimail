// Unit tests for src/lib/passwords.js (PBKDF2 hashing + verification).
import {describe, it, expect} from 'vitest';
import { hashPassword, verifyPassword } from '../../src/lib/passwords.js';

describe('hashPassword / verifyPassword', () => {
  it('produces a self-describing pbkdf2 hash string', async () => {
    const h = await hashPassword('correct horse battery staple');
    expect(h).toMatch(/^pbkdf2:\d+:[^:]+:[^:]+$/);
  });

  it('stays within the Cloudflare PBKDF2 iteration cap (100000) so it runs on the edge', async () => {
    // The deployed Workers runtime rejects PBKDF2 iteration counts above 100000;
    // the local test runtime does not, so this static check (not a runtime one) is
    // what guards against re-raising ITERATIONS past the platform limit.
    const h = await hashPassword('cap-check');
    const iterations = parseInt(h.split(':')[1], 10);
    expect(iterations).toBeLessThanOrEqual(100_000);
  });

  it('verifies the correct password', async () => {
    const h = await hashPassword('!2NowayouT2!');
    expect(await verifyPassword('!2NowayouT2!', h)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const h = await hashPassword('!2NowayouT2!');
    expect(await verifyPassword('wrong', h)).toBe(false);
  });

  it('uses a random salt (same password -> different hashes)', async () => {
    const a = await hashPassword('same');
    const b = await hashPassword('same');
    expect(a).not.toBe(b);
    expect(await verifyPassword('same', a)).toBe(true);
    expect(await verifyPassword('same', b)).toBe(true);
  });

  it('fails safely on malformed or empty input', async () => {
    expect(await verifyPassword('x', '')).toBe(false);
    expect(await verifyPassword('x', 'not-a-hash')).toBe(false);
    expect(await verifyPassword('x', 'pbkdf2:bad')).toBe(false);
    expect(await verifyPassword('', await hashPassword('nonempty'))).toBe(false);
  });
});

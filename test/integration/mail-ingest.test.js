// The core of a disposable-mail service: worker.email() (accept gate, MIME parse,
// AES-GCM encryption, INSERT) and worker.scheduled() (DSGVO retention cleanup).
// These had zero coverage before — and the un-awaited hashForLog() bug lived in
// the MIME-parse-failure branch tested here.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import {beforeEach, describe, it, expect} from 'vitest';
import worker from '../../src/index.js';

const HOUR = 3600 * 1000;
const ENV = { ...env, MAIL_ENCRYPTION_KEY: 'mail-test-key', GOOGLE_SA_KEY: undefined };

beforeEach(async () => {
  for (const t of ['settings', 'trainers', 'addresses', 'messages']) await env.DB.exec('DELETE FROM ' + t);
});

// An active workshop + an active address pointing at it.
async function seedActive(address, { addrExpires = Date.now() + HOUR, trainerUntil = Date.now() + HOUR } = {}) {
  await env.DB.prepare('INSERT INTO trainers (token, name, secret_hash, active_until, enabled, created_at, google_enabled) VALUES (?, ?, 0, ?, 1, 0, 0)')
    .bind('kurs', 'Kurs', trainerUntil).run();
  await env.DB.prepare('INSERT INTO addresses (address, created_at, expires_at, trainer_token) VALUES (?, 0, ?, ?)')
    .bind(address, addrExpires, 'kurs').run();
}
async function deliver(message) {
  const ctx = createExecutionContext();
  await worker.email(message, ENV, ctx);
  await waitOnExecutionContext(ctx);
}
const rawMail = (subject, body) => `From: sender@example.com\r\nTo: x@y.z\r\nSubject: ${subject}\r\n\r\n${body}`;
const count = (addr) => env.DB.prepare("SELECT COUNT(*) AS c FROM messages WHERE to_addr = ?").bind(addr).first().then((r) => r.c);

describe('worker.email() — accept gate + storage', () => {
  it('stores an encrypted message for an active address and stamps first_mail_at', async () => {
    await seedActive('p@kurs');
    await deliver({ to: 'p@kurs', from: 'Sender@Example.com', raw: rawMail('Hallo Workshop', 'Inhalt'), rawSize: 42 });
    expect(await count('p@kurs')).toBe(1);
    const row = await env.DB.prepare("SELECT subject, from_addr FROM messages WHERE to_addr='p@kurs'").first();
    expect(row.subject).toMatch(/^ENC2:/);            // encrypted at rest (mail context)
    expect(row.from_addr).toBe('sender@example.com'); // lowercased
    const addr = await env.DB.prepare("SELECT first_mail_at FROM addresses WHERE address='p@kurs'").first();
    expect(addr.first_mail_at).toBeGreaterThan(0);
  });

  it('drops mail to an expired address', async () => {
    await seedActive('old@kurs', { addrExpires: Date.now() - HOUR });
    await deliver({ to: 'old@kurs', from: 's@x', raw: rawMail('x', 'y') });
    expect(await count('old@kurs')).toBe(0);
  });

  it('drops mail once the workshop is stopped (past the grace period)', async () => {
    await seedActive('p@kurs', { trainerUntil: 0 }); // stopped -> graceEnd = 0 + 10min < now
    await deliver({ to: 'p@kurs', from: 's@x', raw: rawMail('x', 'y') });
    expect(await count('p@kurs')).toBe(0);
  });

  it('drops mail to an unknown address', async () => {
    await deliver({ to: 'nobody@kurs', from: 's@x', raw: rawMail('x', 'y') });
    expect(await count('nobody@kurs')).toBe(0);
  });

  it('survives an unparseable mail and still records the row (MIME-parse-failure branch)', async () => {
    await seedActive('p@kurs');
    // A non-string/stream raw makes PostalMime.parse reject -> the catch path runs
    // (this is the branch where hashForLog() must be awaited).
    await deliver({ to: 'p@kurs', from: 's@x', raw: 12345, rawSize: 1 });
    expect(await count('p@kurs')).toBe(1);
    const row = await env.DB.prepare("SELECT subject FROM messages WHERE to_addr='p@kurs'").first();
    expect(row.subject).toBeNull(); // nothing parsed -> stored as NULL, no crash
  });
});

describe('worker.scheduled() — retention cleanup', () => {
  it('deletes messages older than the retention window and keeps recent ones', async () => {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO messages (to_addr, from_addr, subject, received_at) VALUES ('a@x','s','old', ?)").bind(now - 49 * HOUR).run();
    await env.DB.prepare("INSERT INTO messages (to_addr, from_addr, subject, received_at) VALUES ('a@x','s','new', ?)").bind(now).run();
    const ctx = createExecutionContext();
    await worker.scheduled({}, ENV, ctx);
    await waitOnExecutionContext(ctx);
    const rows = await env.DB.prepare("SELECT subject FROM messages WHERE to_addr='a@x'").all();
    expect(rows.results.map((r) => r.subject)).toEqual(['new']);
  });

  it('deletes a recent message once ITS address has expired (PRIV-03: honours ttl, not just 48h)', async () => {
    const now = Date.now();
    await env.DB.prepare("INSERT INTO addresses (address, created_at, expires_at, trainer_token) VALUES ('exp@x', 0, ?, 'kurs')").bind(now - HOUR).run(); // expired
    await env.DB.prepare("INSERT INTO addresses (address, created_at, expires_at, trainer_token) VALUES ('live@x', 0, ?, 'kurs')").bind(now + HOUR).run(); // active
    await env.DB.prepare("INSERT INTO messages (to_addr, from_addr, subject, received_at) VALUES ('exp@x','s','recent-but-expired', ?)").bind(now).run();
    await env.DB.prepare("INSERT INTO messages (to_addr, from_addr, subject, received_at) VALUES ('live@x','s','recent-and-active', ?)").bind(now).run();
    const ctx = createExecutionContext();
    await worker.scheduled({}, ENV, ctx);
    await waitOnExecutionContext(ctx);
    expect(await count('exp@x')).toBe(0);  // address expired -> mail gone despite being recent
    expect(await count('live@x')).toBe(1); // address still active -> mail kept
  });
});

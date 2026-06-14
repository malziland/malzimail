// Unit tests for src/lib/crypto.js — runs inside the workerd runtime, so
// crypto.subtle / btoa behave exactly as in production.
import {describe, it, expect} from 'vitest';
import { makeCipher, cipherEncrypt, cipherDecrypt } from '../../src/lib/crypto.js';

const SECRET = 'test-secret-key-for-unit-tests';

// Reproduce a legacy ENC1 value exactly as the OLD scheme produced it
// (AES-GCM, key = SHA-256(secret), iv prepended, base64, 'ENC1:' prefix) so we
// can prove the new code still decrypts pre-existing data.
async function legacyEnc1(secret, plaintext) {
  const enc = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(secret));
  const key = await crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(plaintext));
  const combined = new Uint8Array(iv.length + ct.byteLength);
  combined.set(iv, 0); combined.set(new Uint8Array(ct), iv.length);
  let s = '';
  for (const b of combined) s += String.fromCharCode(b);
  return 'ENC1:' + btoa(s);
}

describe('makeCipher', () => {
  it('returns null without a secret', async () => {
    expect(await makeCipher('', 'mail')).toBeNull();
    expect(await makeCipher(null, 'mail')).toBeNull();
  });
});

describe('cipherEncrypt / cipherDecrypt (ENC2, HKDF, domain-separated)', () => {
  it('round-trips and tags ENC2', async () => {
    const c = await makeCipher(SECRET, 'mail');
    const ct = await cipherEncrypt('Hallo Workshop! äöü €', c);
    expect(ct).toMatch(/^ENC2:/);
    expect(await cipherDecrypt(ct, c)).toBe('Hallo Workshop! äöü €');
  });

  it('random IV -> different ciphertexts for the same input', async () => {
    const c = await makeCipher(SECRET, 'mail');
    expect(await cipherEncrypt('same', c)).not.toBe(await cipherEncrypt('same', c));
  });

  it('passes through null / empty / untagged values', async () => {
    const c = await makeCipher(SECRET, 'mail');
    expect(await cipherEncrypt(null, c)).toBeNull();
    expect(await cipherEncrypt('', c)).toBe('');
    expect(await cipherDecrypt(null, c)).toBeNull();
    expect(await cipherDecrypt('untagged plaintext', c)).toBe('untagged plaintext');
  });

  it('passes plaintext through when no cipher is configured', async () => {
    expect(await cipherEncrypt('no key', null)).toBe('no key');
  });

  it('fails safely with the wrong secret', async () => {
    const c = await makeCipher(SECRET, 'mail');
    const wrong = await makeCipher('a-completely-different-secret', 'mail');
    const ct = await cipherEncrypt('geheim', c);
    expect(await cipherDecrypt(ct, wrong)).toBe('[Entschlüsselung fehlgeschlagen]');
  });

  it('reports a missing key for ENC2 values', async () => {
    const c = await makeCipher(SECRET, 'mail');
    const ct = await cipherEncrypt('geheim', c);
    expect(await cipherDecrypt(ct, null)).toBe('[verschlüsselt – kein Schlüssel verfügbar]');
  });
});

describe('domain separation (mail vs google get independent keys)', () => {
  it('a value encrypted under one context cannot be decrypted under another', async () => {
    const mail = await makeCipher(SECRET, 'mail');
    const google = await makeCipher(SECRET, 'google');
    const ct = await cipherEncrypt('cross-context secret', mail);
    expect(await cipherDecrypt(ct, mail)).toBe('cross-context secret');                 // same context: ok
    expect(await cipherDecrypt(ct, google)).toBe('[Entschlüsselung fehlgeschlagen]');    // other context: fails
  });
});

describe('migration: legacy ENC1 data stays readable', () => {
  it('decrypts an ENC1 value written by the old SHA-256 scheme (any context)', async () => {
    const legacy = await legacyEnc1(SECRET, 'altbestand');
    expect(legacy).toMatch(/^ENC1:/);
    // ENC1 uses the context-independent legacy key, so either context reads it.
    expect(await cipherDecrypt(legacy, await makeCipher(SECRET, 'mail'))).toBe('altbestand');
    expect(await cipherDecrypt(legacy, await makeCipher(SECRET, 'google'))).toBe('altbestand');
  });
});

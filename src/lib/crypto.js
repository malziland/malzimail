// AES-256-GCM symmetric encryption for stored secrets (mail bodies, the Google
// service-account key, …).
//
// Key derivation (hardened): keys are derived from the worker secret
// MAIL_ENCRYPTION_KEY via HKDF-SHA256 with a per-context `info` label, so the
// "mail" context and the "google" context get cryptographically independent
// keys (domain separation — a derived key for one context can never decrypt the
// other). HKDF (not PBKDF2) is the right primitive here because the master
// secret is high-entropy random material, not a human password; it also runs in
// microseconds, so it adds no latency to the per-poll mail decryption (PBKDF2's
// deliberately slow iterations would run on every request and risk the Workers
// CPU limit for no real gain on a high-entropy key).
//
// Stored values are tagged so old and new data coexist during/after rollout:
//   ENC1:  legacy — AES-GCM, key = SHA-256(secret), NO domain separation (read-only now)
//   ENC2:  current — AES-GCM, key = HKDF-SHA256(secret, info=context)
// A bare (untagged) value is treated as plaintext (pre-encryption rollout).

const ENC_V1 = 'ENC1:';
const ENC_V2 = 'ENC2:';
const HKDF_SALT = 'malzimail.hkdf.salt.v2'; // fixed app salt; security comes from the high-entropy IKM + info

// Build a per-context cipher from the master secret. Returns null when no secret
// is configured (then encryption is a no-op and values are stored as plaintext).
export async function makeCipher(secret, context) {
  if (!secret) return null;
  const enc = new TextEncoder();
  const raw = enc.encode(secret);

  // Legacy key for reading ENC1 values (SHA-256 of the secret, no context).
  const legacyHash = await crypto.subtle.digest('SHA-256', raw);
  const legacyKey = await crypto.subtle.importKey('raw', legacyHash, { name: 'AES-GCM' }, false, ['decrypt']);

  // Current key (ENC2): HKDF with a context-specific info label -> domain separation.
  const ikm = await crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
  const currentKey = await crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: enc.encode(HKDF_SALT), info: enc.encode('malzimail:' + context) },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );

  return { currentKey, legacyKey, context };
}

export async function cipherEncrypt(plaintext, cipher) {
  if (plaintext == null || plaintext === '') return plaintext;
  if (!cipher) return plaintext;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cipher.currentKey, enc);
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return ENC_V2 + bytesToBase64(combined);
}

export async function cipherDecrypt(value, cipher) {
  if (value == null || typeof value !== 'string') return value;
  let key, body;
  if (value.startsWith(ENC_V2)) { key = cipher && cipher.currentKey; body = value.slice(ENC_V2.length); }
  else if (value.startsWith(ENC_V1)) { key = cipher && cipher.legacyKey; body = value.slice(ENC_V1.length); }
  else return value; // untagged -> plaintext
  if (!key) return '[verschlüsselt – kein Schlüssel verfügbar]';
  try {
    const data = base64ToBytes(body);
    const iv = data.slice(0, 12);
    const ciphertext = data.slice(12);
    const dec = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ciphertext);
    return new TextDecoder().decode(dec);
  } catch (e) {
    return '[Entschlüsselung fehlgeschlagen]';
  }
}

function bytesToBase64(bytes) {
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str);
}

function base64ToBytes(b64) {
  const str = atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

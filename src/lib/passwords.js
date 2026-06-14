// Password hashing (PBKDF2-SHA256, random salt) + verification.
// Stored format: "pbkdf2:<iterations>:<saltB64>:<hashB64>" — self-describing,
// so iteration count can be raised later without breaking existing hashes.

// Cloudflare Workers hard-caps PBKDF2 at 100_000 iterations (DoS prevention) — higher
// values throw "iteration counts above 100000 are not supported" on the deployed edge
// (the local test runtime does NOT enforce this, so 600k passed in CI but 500'd live).
// 100_000 is therefore the platform maximum for PBKDF2 here. The count is stored per
// hash (self-describing format below), so it can rise if the platform cap ever does.
const ITERATIONS = 100_000;
const HASH_BYTES = 32;

function toB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function fromB64(b64) {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return bytes;
}

async function derive(password, salt, iterations) {
  const keyMaterial = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  return `pbkdf2:${ITERATIONS}:${toB64(salt)}:${toB64(hash)}`;
}

export async function verifyPassword(password, stored) {
  if (!password || typeof stored !== 'string') return false;
  const parts = stored.split(':');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const iterations = parseInt(parts[1], 10);
  if (!Number.isFinite(iterations) || iterations < 1) return false;
  const salt = fromB64(parts[2]);
  const expected = fromB64(parts[3]);
  // Fail closed: if a stored hash carries an iteration count the runtime rejects
  // (e.g. >100000 on Cloudflare), derive() throws — treat that as "no match"
  // rather than letting it bubble up as a 500 on the login path.
  let actual;
  try {
    actual = await derive(password, salt, iterations);
  } catch {
    return false;
  }
  if (actual.length !== expected.length) return false;
  // Constant-time comparison
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i] ^ expected[i];
  return diff === 0;
}

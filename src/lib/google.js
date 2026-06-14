// Optional Google Admin SDK integration: create/delete managed Google accounts
// on a custom domain via a service account with domain-wide delegation.
//
// Inert unless these are configured (Worker secrets / vars):
//   GOOGLE_SA_KEY          – the service-account JSON key (full string)
//   GOOGLE_ADMIN_SUBJECT   – a super-admin to impersonate, e.g. admin@id.malzimail.at
//   GOOGLE_ACCOUNT_DOMAIN  – the domain for the logins, e.g. id.malzimail.at

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERS_URL = 'https://admin.googleapis.com/admin/directory/v1/users';
const SCOPE = 'https://www.googleapis.com/auth/admin.directory.user';

function b64urlBytes(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}
const b64urlStr = (str) => b64urlBytes(new TextEncoder().encode(str));

function pemToPkcs8(pem) {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// Returns a config object, or null if the integration is not configured.
export function googleConfig(env) {
  if (!env || !env.GOOGLE_SA_KEY || !env.GOOGLE_ADMIN_SUBJECT || !env.GOOGLE_ACCOUNT_DOMAIN) {
    return null;
  }
  let key;
  try {
    key = JSON.parse(env.GOOGLE_SA_KEY);
  } catch {
    return null;
  }
  if (!key.client_email || !key.private_key) return null;
  return { key, subject: env.GOOGLE_ADMIN_SUBJECT, domain: env.GOOGLE_ACCOUNT_DOMAIN };
}

async function getAccessToken(cfg) {
  const now = Math.floor(Date.now() / 1000);
  const header = b64urlStr(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64urlStr(JSON.stringify({
    iss: cfg.key.client_email,
    sub: cfg.subject,
    scope: SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claim}`;
  const cryptoKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToPkcs8(cfg.key.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${b64urlBytes(new Uint8Array(sig))}`;

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error('google_token_failed');
  const data = await res.json();
  return data.access_token;
}

// Creates login@domain with the given password. Returns the full email.
// Throws an error with .status === 409 when the login already exists.
export async function createGoogleUser(cfg, login, password) {
  const token = await getAccessToken(cfg);
  const email = `${login}@${cfg.domain}`;
  const res = await fetch(USERS_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      primaryEmail: email,
      name: { givenName: 'Workshop', familyName: login },
      password,
      changePasswordAtNextLogin: false,
    }),
  });
  if (res.ok) return email;
  let detail = {};
  try { detail = await res.json(); } catch { /* ignore */ }
  const err = new Error('google_create_failed');
  err.status = res.status;
  err.reason = JSON.stringify(detail).toLowerCase();
  throw err;
}

// Read-only connectivity check: get a token and list at most one user. Proves the
// service-account key, domain-wide delegation, the admin subject AND domain access
// — without creating or changing anything. Returns { ok, step?, status?, detail? }.
export async function testGoogleConnection(cfg) {
  let token;
  try {
    token = await getAccessToken(cfg);
  } catch (e) {
    return { ok: false, step: 'token', detail: e.message };
  }
  const res = await fetch(`${USERS_URL}?domain=${encodeURIComponent(cfg.domain)}&maxResults=1`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (res.ok) return { ok: true };
  let detail = '';
  try { detail = JSON.stringify(await res.json()); } catch { /* ignore */ }
  return { ok: false, step: 'list', status: res.status, detail };
}

// Deletes a Google account by full email. Returns true on success / already gone.
export async function deleteGoogleUser(cfg, email) {
  const token = await getAccessToken(cfg);
  const res = await fetch(USERS_URL + '/' + encodeURIComponent(email), {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  });
  return res.status === 204 || res.status === 404;
}

// Delete many users with a SINGLE access token (valid ~1h), so N deletions cost
// N+1 subrequests instead of 2N. Used by the emergency "delete all" action.
// Returns [{ email, ok }] — 404 counts as ok (account already gone).
export async function deleteGoogleUsers(cfg, emails) {
  const token = await getAccessToken(cfg);
  const out = [];
  for (const email of emails) {
    try {
      const res = await fetch(USERS_URL + '/' + encodeURIComponent(email), {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      });
      out.push({ email, ok: res.status === 204 || res.status === 404 });
    } catch {
      out.push({ email, ok: false });
    }
  }
  return out;
}

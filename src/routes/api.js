// Participant-facing JSON API: address minting + mailbox reads + QR + export.

import QRCode from 'qrcode-svg';
import { jsonResponse, parseCookies } from '../lib/http.js';
import { makeCipher, cipherEncrypt, cipherDecrypt } from '../lib/crypto.js';
import { createGoogleUser, deleteGoogleUser } from '../lib/google.js';
import { randomString, startOfTodayMs } from '../lib/util.js';
import { ttlHours } from '../domain/settings.js';
import { resolveGoogleConfig } from '../domain/google.js';
import {
  friendlyLogin, readToken, paramAddress,
  ADDRESS_PREFIX, RANDOM_LENGTH, MAX_GENERATION_ATTEMPTS, MESSAGES_LIMIT, MESSAGE_RETENTION_MS,
} from '../domain/address.js';
import {
  deleteOldMessages, insertAddress, setAddressGoogle, deleteAddress,
  findAddressTimes, findAddressExpiry, listMessageHeaders, getMessageRow, listMessagesFull,
  getTrainer, countGeneratedToday, countUsedToday,
} from '../db/queries.js';

export async function handleApi(request, env, url) {
  try {
    if (url.pathname === '/api/address' && request.method === 'POST') {
      return await createAddress(request, env, url);
    }
    if (url.pathname === '/api/address/status' && request.method === 'GET') {
      return await addressStatus(env, url);
    }
    if (url.pathname === '/api/messages' && request.method === 'GET') {
      return await listMessages(request, env, url);
    }
    if (url.pathname === '/api/export' && request.method === 'GET') {
      return await exportMessages(request, env, url);
    }
    if (url.pathname === '/api/qr' && request.method === 'GET') {
      return qrResponse(url.searchParams.get('text') || '');
    }
    const frameMatch = url.pathname.match(/^\/api\/message\/(\d+)\/frame$/);
    if (frameMatch && request.method === 'GET') {
      return await getMessageFrame(request, env, url, parseInt(frameMatch[1], 10));
    }
    const msgMatch = url.pathname.match(/^\/api\/message\/(\d+)$/);
    if (msgMatch && request.method === 'GET') {
      return await getMessage(request, env, url, parseInt(msgMatch[1], 10));
    }
    return jsonResponse({ error: 'not_found' }, 404);
  } catch (err) {
    console.error('API error');
    return jsonResponse({ error: 'internal' }, 500);
  }
}

async function createAddress(request, env, url) {
  if (Math.random() < 0.05) {
    try {
      const cutoff = Date.now() - MESSAGE_RETENTION_MS;
      await deleteOldMessages(env.DB, cutoff);
    } catch (e) { /* best effort */ }
  }

  const token = readToken(request, url);
  if (!token) return jsonResponse({ error: 'missing_token' }, 401);


  const trainer = await getTrainer(env.DB, token);
  if (!trainer || !trainer.enabled) return jsonResponse({ error: 'invalid_token' }, 403);

  const now = Date.now();
  if (trainer.active_until <= now) return jsonResponse({ error: 'workshop_inactive' }, 403);

  const todayStart = startOfTodayMs();
  const genRow = await countGeneratedToday(env.DB, token, todayStart);
  const genCount = genRow ? genRow.cnt : 0;
  if (trainer.daily_gen_limit && genCount >= trainer.daily_gen_limit) {
    return jsonResponse({ error: 'bot_limit_reached', limit: trainer.daily_gen_limit }, 429);
  }
  const usedRow = await countUsedToday(env.DB, token, todayStart);
  const usedCount = usedRow ? usedRow.cnt : 0;
  if (trainer.daily_used_limit && usedCount >= trainer.daily_used_limit) {
    return jsonResponse({ error: 'quota_reached', limit: trainer.daily_used_limit }, 429);
  }

  // Fail loud on a misconfigured instance — never silently fall back to another
  // operator's domain (a self-hoster who forgot MAIL_DOMAIN would otherwise mint
  // addresses on someone else's live domain, and their mail would never arrive).
  const domain = env.MAIL_DOMAIN;
  if (!domain) {
    console.error('MAIL_DOMAIN ist nicht gesetzt — Adress-Erzeugung abgebrochen.');
    return jsonResponse({ error: 'misconfigured', detail: 'MAIL_DOMAIN ist nicht gesetzt (wrangler.jsonc → vars.MAIL_DOMAIN).' }, 500);
  }
  const ttlMs = (await ttlHours(env)) * 3600 * 1000;
  // Cap the address lifetime at the workshop's end so the participant can never
  // see (or get) more time than the trainer allows — the displayed countdown
  // follows the trainer's window, not a fresh 24h per address.
  const expiresAt = Math.min(now + ttlMs, trainer.active_until);

  // Google integration follows the Worker configuration automatically — decision
  // 11.06.2026 "Google ohne Häkchen": no per-workshop toggle. Whenever the Worker
  // has Google credentials configured, accounts are provisioned; otherwise the
  // classic random address is used. (Same condition the admin shows as "aktiv",
  // so the dashboard and the actual behaviour can never drift apart again.)
  const gCfg = await resolveGoogleConfig(env);

  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt++) {
    const localPart = gCfg ? friendlyLogin() : `${ADDRESS_PREFIX}${randomString(RANDOM_LENGTH)}`;
    const address = `${localPart}@${domain}`;
    const result = await insertAddress(env.DB, address, now, expiresAt, token);
    if (result.meta.changes !== 1) continue; // local part collided, try again

    if (!gCfg) {
      return jsonResponse({ address, expires_at: expiresAt });
    }

    // Provision the matching Google account (login = local part, password = login).
    let googleEmail = null;
    try {
      googleEmail = await createGoogleUser(gCfg, localPart, localPart);
      const gCipher = await makeCipher(env.MAIL_ENCRYPTION_KEY, 'google');
      const encPw = await cipherEncrypt(localPart, gCipher);
      await setAddressGoogle(env.DB, googleEmail, encPw, address);
      return jsonResponse({
        address, expires_at: expiresAt,
        google: { login: googleEmail, password: localPart },
      });
    } catch (e) {
      // Name already taken in Google -> drop this address row and retry a new name.
      if (e && e.status === 409) {
        await deleteAddress(env.DB, address);
        continue;
      }
      // BUG-01: if the account was already created at Google but a later step
      // (encrypt / DB write) failed, delete it again — otherwise it orphans
      // (it has no google_login in D1, so neither the cron nor "stop" would ever
      // clean it up = permanent seat-leak + undeleted personal data).
      if (googleEmail) {
        try { await deleteGoogleUser(gCfg, googleEmail); } catch { /* best effort */ }
      }
      // Keep the mail address (it works), but tell the UI why the Google login is
      // missing. Best-effort distinction of the account-cap ("limit") case.
      const reason = (e && e.reason) || '';
      const isLimit = /limit|seat|quota|maximum/.test(reason);
      console.error('Google account creation failed');
      return jsonResponse({ address, expires_at: expiresAt, google_status: isLimit ? 'limit' : 'error' });
    }
  }
  return jsonResponse({ error: 'generation_failed' }, 500);
}

async function addressStatus(env, url) {
  const to = paramAddress(url);
  if (!to) return jsonResponse({ error: 'missing_to' }, 400);
  const row = await findAddressTimes(env.DB, to);
  if (!row) return jsonResponse({ error: 'unknown' }, 404);
  return jsonResponse({
    address: to, created_at: row.created_at, expires_at: row.expires_at,
    active: row.expires_at > Date.now()
  });
}

// SEC-02: the token proving the requester belongs to the workshop that owns the
// address — from ?t, the x-trainer-token header, or the mzm_t cookie (which the
// participant app sends automatically same-origin). Gates mailbox reads/exports.
function requesterToken(request, url) {
  const direct = readToken(request, url); // ?t or x-trainer-token header
  if (direct) return direct;
  const ck = (parseCookies(request.headers.get('cookie') || '')['mzm_t'] || '').trim().toLowerCase();
  return ck || null;
}

// Returns a 403 Response if the requester's token does not own the address, else null.
function denyIfNotOwner(request, url, addr) {
  const reqTok = requesterToken(request, url);
  if (!reqTok || reqTok !== (addr.trainer_token || '').toLowerCase()) {
    return jsonResponse({ error: 'forbidden' }, 403);
  }
  return null;
}

async function listMessages(request, env, url) {
  const to = paramAddress(url);
  if (!to) return jsonResponse({ error: 'missing_to' }, 400);
  const addr = await findAddressExpiry(env.DB, to);
  if (!addr) return jsonResponse({ error: 'unknown' }, 404);
  const denied = denyIfNotOwner(request, url, addr);
  if (denied) return denied;
  if (addr.expires_at <= Date.now()) {
    // expires_at === 0 is the sentinel set by the emergency reset; the app shows
    // a "session was reset" notice for it instead of the normal expiry message.
    const reason = addr.expires_at === 0 ? 'reset' : 'expired';
    return jsonResponse({ error: reason, expires_at: addr.expires_at }, 410);
  }

  const key = await makeCipher(env.MAIL_ENCRYPTION_KEY, 'mail');
  const { results } = await listMessageHeaders(env.DB, to, MESSAGES_LIMIT);
  for (const m of results) {
    m.subject = await cipherDecrypt(m.subject, key);
  }
  return jsonResponse({ messages: results, expires_at: addr.expires_at });
}

async function getMessage(request, env, url, id) {
  const to = paramAddress(url);
  if (!to) return jsonResponse({ error: 'missing_to' }, 400);
  const addr = await findAddressExpiry(env.DB, to);
  if (!addr) return jsonResponse({ error: 'unknown' }, 404);
  const denied = denyIfNotOwner(request, url, addr);
  if (denied) return denied;
  if (addr.expires_at <= Date.now()) return jsonResponse({ error: 'expired' }, 410);

  const row = await getMessageRow(env.DB, id, to);
  if (!row) return jsonResponse({ error: 'not_found' }, 404);

  const key = await makeCipher(env.MAIL_ENCRYPTION_KEY, 'mail');
  row.subject = await cipherDecrypt(row.subject, key);
  row.text_body = await cipherDecrypt(row.text_body, key);
  row.html_body = await cipherDecrypt(row.html_body, key);
  return jsonResponse(row);
}

// Serves a single message's HTML body as its OWN isolated document, loaded via an
// <iframe src> (NOT srcdoc — srcdoc would inherit the page's strict CSP and strip the
// mail's inline styles). Same owner-token gate as the other reads. The response carries
// a dedicated, deliberately-permissive-but-safe CSP: scripts fully blocked (default-src
// 'none', no script-src), the mail's own inline styles allowed (style-src 'unsafe-inline'),
// external images/fonts blocked (privacy — no tracking pixels / IP leak), `sandbox`
// enforcing an opaque origin even if opened directly.
async function getMessageFrame(request, env, url, id) {
  const to = paramAddress(url);
  if (!to) return jsonResponse({ error: 'missing_to' }, 400);
  const addr = await findAddressExpiry(env.DB, to);
  if (!addr) return jsonResponse({ error: 'unknown' }, 404);
  const denied = denyIfNotOwner(request, url, addr);
  if (denied) return denied;
  if (addr.expires_at <= Date.now()) return jsonResponse({ error: 'expired' }, 410);

  const row = await getMessageRow(env.DB, id, to);
  if (!row) return jsonResponse({ error: 'not_found' }, 404);
  const key = await makeCipher(env.MAIL_ENCRYPTION_KEY, 'mail');
  const html = await cipherDecrypt(row.html_body, key);
  const body = '<!doctype html><base target="_blank">' + (html || '');
  return new Response(body, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-security-policy':
        "sandbox allow-popups allow-popups-to-escape-sandbox; default-src 'none'; " +
        "style-src 'unsafe-inline'; img-src data: blob:; font-src data:; frame-ancestors 'self';",
      'x-frame-options': 'SAMEORIGIN',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cache-control': 'no-store',
    },
  });
}

async function exportMessages(request, env, url) {
  const to = paramAddress(url);
  if (!to) return jsonResponse({ error: 'missing_to' }, 400);
  const addr = await findAddressTimes(env.DB, to);
  if (!addr) return jsonResponse({ error: 'unknown' }, 404);
  const denied = denyIfNotOwner(request, url, addr);
  if (denied) return denied;
  // PRIV-01: same expiry gate as the other read endpoints (no Klartext after expiry).
  if (addr.expires_at <= Date.now()) return jsonResponse({ error: 'expired' }, 410);

  const key = await makeCipher(env.MAIL_ENCRYPTION_KEY, 'mail');
  const { results } = await listMessagesFull(env.DB, to, MESSAGES_LIMIT);
  for (const m of results) {
    m.subject = await cipherDecrypt(m.subject, key);
    m.text_body = await cipherDecrypt(m.text_body, key);
    m.html_body = await cipherDecrypt(m.html_body, key);
  }

  const exportData = {
    address: to,
    address_created_at: addr.created_at,
    address_expires_at: addr.expires_at,
    exported_at: Date.now(),
    message_count: results.length,
    messages: results
  };
  const filename = `malzimail-export-${to.replace(/[^a-z0-9]/g, '_')}-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(exportData, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'content-disposition': `attachment; filename="${filename}"`,
      'cache-control': 'no-store'
    }
  });
}

function qrResponse(text) {
  if (!text) return new Response('Missing text', { status: 400 });
  const safe = text.substring(0, 512);
  const svg = new QRCode({
    content: safe,
    padding: 2,
    width: 300,
    height: 300,
    color: '#000000',
    background: '#ffffff',
    ecl: 'M'
  }).svg();
  return new Response(svg, {
    headers: { 'content-type': 'image/svg+xml; charset=utf-8', 'cache-control': 'public, max-age=3600' }
  });
}

// Google integration DOMAIN logic (distinct from lib/google.js, the SDK client):
// config resolution with precedence, account stats, connection-test bookkeeping,
// and the "wipe all sessions" operation used by the admin stop/reset.

import { getSetting, setSetting } from './settings.js';
import { makeCipher, cipherDecrypt } from '../lib/crypto.js';
import { googleConfig, deleteGoogleUsers } from '../lib/google.js';
import {
  countActiveGoogleAccounts, findAddressesWithGoogle, clearGoogleLogin,
  deleteMessagesForActiveAddresses, retireActiveAddresses,
} from '../db/queries.js';

// Resolve the Google integration config with precedence: operator-configured
// settings (admin panel; the service-account key is stored AES-GCM-encrypted at
// rest) -> Worker secret/vars -> none. Returns a validated config object or null.
// An empty settings table therefore keeps exactly the secret-based behaviour.
export async function resolveGoogleConfig(env) {
  const subject = (await getSetting(env, 'google_admin_subject')) || env.GOOGLE_ADMIN_SUBJECT || '';
  const domain = (await getSetting(env, 'google_account_domain')) || env.GOOGLE_ACCOUNT_DOMAIN || env.MAIL_DOMAIN || '';
  let rawKey = env.GOOGLE_SA_KEY || '';
  const keyEnc = await getSetting(env, 'google_sa_key_enc');
  if (keyEnc) {
    const k = await makeCipher(env.MAIL_ENCRYPTION_KEY, 'google');
    const dec = await cipherDecrypt(keyEnc, k);
    if (dec && dec.startsWith('{')) rawKey = dec; // ignore decrypt-failure sentinels ('[…]')
  }
  if (!rawKey || !subject || !domain) return null;
  return googleConfig({ GOOGLE_SA_KEY: rawKey, GOOGLE_ADMIN_SUBJECT: subject, GOOGLE_ACCOUNT_DOMAIN: domain });
}

// Count of Google accounts that physically exist at Google right now: an address
// keeps its google_login until the cron actually deletes the account, so this is
// the true slot usage against the free-tier limit (no Google API call needed).
export async function googleAccountStats(env) {
  const row = await countActiveGoogleAccounts(env.DB);
  const active = row ? row.cnt : 0;
  const limit = parseInt(await getSetting(env, 'google_account_limit'), 10) || 50;
  return { active, limit, free: Math.max(0, limit - active) };
}

// Persist the outcome of the last Google connection test so the dashboard (and
// the system itself) can show the REAL state — "verbunden" vs "fehlgeschlagen" —
// instead of merely "a key is present".
export async function recordGoogleTest(env, result) {
  await setSetting(env, 'google_last_test_ok', result && result.ok ? '1' : '0');
  await setSetting(env, 'google_last_test_at', String(Date.now()));
}

// Short human summary of a test result for the flash message.
export function googleTestSummary(r) {
  if (r && r.ok) return 'Verbindung erfolgreich getestet ✓';
  const parts = [];
  if (r && r.step) parts.push(r.step);
  if (r && r.status) parts.push('HTTP ' + r.status);
  return 'Verbindung fehlgeschlagen' + (parts.length ? ' (' + parts.join(' · ') + ')' : '') + '.';
}

// Wipe everything for the current workshop: delete all Google accounts at Google,
// empty all active mailboxes and retire those addresses (expires_at = 0 sentinel,
// which the app shows as a reset). Used by "stop workshop". Returns counts.
export async function wipeAllSessions(env) {
  const cfg = await resolveGoogleConfig(env);
  const withGoogle = (await findAddressesWithGoogle(env.DB)).results;
  let deleted = 0, failed = 0;
  if (cfg && withGoogle.length) {
    const outcomes = await deleteGoogleUsers(cfg, withGoogle.map((r) => r.google_login));
    const okByEmail = new Map(outcomes.map((o) => [o.email, o.ok]));
    for (const row of withGoogle) {
      if (okByEmail.get(row.google_login)) {
        await clearGoogleLogin(env.DB, row.address);
        deleted++;
      } else {
        failed++;
      }
    }
  }
  const now = Date.now();
  await deleteMessagesForActiveAddresses(env.DB, now);
  const upd = await retireActiveAddresses(env.DB, now);
  return { deleted, failed, reset: (upd.meta && upd.meta.changes) || 0 };
}

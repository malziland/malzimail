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

// Wipe everything for the current workshop: empty all active mailboxes, retire
// those addresses (expires_at = 0 sentinel, shown as a reset) and delete the
// Google accounts. Used by "stop workshop".
//
// The LOCAL wipe runs FIRST and unconditionally, so the emergency stop always
// clears mailboxes and kills the link even when Google is unreachable — the
// Google call must never gate the local deletion. If the Google side fails
// (e.g. the OAuth token cannot be fetched), the accounts keep their google_login
// and are now retired (expires_at = 0), so the scheduled cron retries deleting
// them; `googleError` is returned true so the UI can say so. Returns counts.
export async function wipeAllSessions(env) {
  const now = Date.now();
  await deleteMessagesForActiveAddresses(env.DB, now);
  const upd = await retireActiveAddresses(env.DB, now);
  const reset = (upd.meta && upd.meta.changes) || 0;

  const cfg = await resolveGoogleConfig(env);
  const withGoogle = (await findAddressesWithGoogle(env.DB)).results;
  let deleted = 0, failed = 0, googleError = false;
  if (cfg && withGoogle.length) {
    try {
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
    } catch {
      // Token fetch / network failure: leave google_login set (addresses are now
      // retired) so the cron retries; the local wipe already succeeded.
      googleError = true;
      failed = withGoogle.length;
    }
  }
  return { deleted, failed, reset, googleError };
}

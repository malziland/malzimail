// Worker entry: fetch router + inbound email ingestion + scheduled cleanup.
// All request handlers live in src/routes/*, all SQL in src/db/queries.js,
// all helpers in src/lib/* and src/domain/* — this file only wires them up.
import PostalMime from 'postal-mime';
import {
  renderImpressum, renderDatenschutz, renderNutzungsbedingungen,
} from './pages.js';
import { getLegalContext } from './domain/legal.js';
import { resolveGoogleConfig } from './domain/google.js';
import { htmlResponse, withSecurity } from './lib/http.js';
import {
  findAddressForDelivery, insertMessage, setFirstMailAt,
  deleteRetiredMessages, findExpiredGoogleAddresses, clearGoogleLogin,
} from './db/queries.js';
import { makeCipher, cipherEncrypt } from './lib/crypto.js';
import { deleteGoogleUser } from './lib/google.js';
import { hashForLog } from './lib/util.js';
import { GRACE_PERIOD_MS, MESSAGE_RETENTION_MS } from './domain/address.js';
import { handleApi } from './routes/api.js';
import { handleAdmin } from './routes/admin.js';
import { handleRoot } from './routes/public.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      // The email-body frame serves UNTRUSTED third-party mail HTML in full isolation,
      // with its OWN scoped CSP (inline styles ok, scripts blocked) + same-origin
      // framing. It must bypass finalize/withSecurity, which would otherwise force the
      // strict app CSP (stripping the mail's inline styles), X-Frame-Options: DENY
      // (blocking the iframe) and the footer rewrite. The handler sets all its headers.
      if (/^\/api\/message\/\d+\/frame$/.test(url.pathname)) {
        return await handleApi(request, env, url);
      }
      return finalize(env, await handleApi(request, env, url), url.pathname);
    }

    if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
      return finalize(env,await handleAdmin(request, env, url), url.pathname);
    }

    if (url.pathname === '/cockpit') {
      return new Response('', { status: 308, headers: { location: '/admin' } });
    }

    if (url.pathname === '/impressum') return finalize(env,htmlResponse(renderImpressum(await getLegalContext(env, url.origin))), url.pathname);
    if (url.pathname === '/datenschutz') return finalize(env,htmlResponse(renderDatenschutz(await getLegalContext(env, url.origin))), url.pathname);
    if (url.pathname === '/nutzungsbedingungen' || url.pathname === '/agb') {
      return finalize(env,htmlResponse(renderNutzungsbedingungen(await getLegalContext(env, url.origin))), url.pathname);
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return finalize(env,await handleRoot(request, env, url), url.pathname);
    }

    if (env.ASSETS) {
      return finalize(env,await env.ASSETS.fetch(request), url.pathname);
    }
    return finalize(env,new Response('Not found', { status: 404 }), url.pathname);
  },

  async email(message, env, ctx) {
    const to = (message.to || '').toLowerCase();
    const now = Date.now();

    const row = await findAddressForDelivery(env.DB, to);

    // Diagnostics: a dropped mail otherwise vanishes without a trace, which leaves
    // a fresh self-hoster (testing their Email-Routing setup) with no feedback.
    // Addresses are logged hashed only (privacy).
    if (!row || row.expires_at <= now) {
      console.warn('Mail verworfen: Adresse unbekannt oder abgelaufen', await hashForLog(to));
      return;
    }
    if (row.trainer_token) {
      const graceEnd = (row.trainer_active_until || 0) + GRACE_PERIOD_MS;
      if (!row.trainer_enabled || graceEnd <= now) {
        console.warn('Mail verworfen: Workshop inaktiv oder beendet', await hashForLog(to));
        return;
      }
    }

    let parsed;
    try {
      parsed = await PostalMime.parse(message.raw);
    } catch (err) {
      console.error('MIME parse failed for address', await hashForLog(to));
      parsed = {};
    }

    // A missing MAIL_ENCRYPTION_KEY turns the cipher into a no-op (bodies stored as
    // plaintext). Never let that be silent on a misconfigured instance — log loudly
    // so a self-hoster notices (the admin self-check surfaces it too).
    if (!env.MAIL_ENCRYPTION_KEY) {
      console.error('MAIL_ENCRYPTION_KEY fehlt — Mail-Inhalte würden UNVERSCHLÜSSELT gespeichert. Bitte das Secret setzen.');
    }
    const key = await makeCipher(env.MAIL_ENCRYPTION_KEY, 'mail');
    const subjectEnc = await cipherEncrypt(parsed.subject ?? null, key);
    const textEnc = await cipherEncrypt(parsed.text ?? null, key);
    const htmlEnc = await cipherEncrypt(parsed.html ?? null, key);

    try {
      await insertMessage(env.DB, {
        to,
        from: (message.from || '').toLowerCase(),
        subjectEnc,
        textEnc,
        htmlEnc,
        rawSize: message.rawSize ?? null,
        now,
      });
    } catch (err) {
      // Log (hashed) and rethrow so Cloudflare retries instead of silently losing the mail.
      console.error('Mail-Speicherung fehlgeschlagen', await hashForLog(to));
      throw err;
    }

    if (!row.first_mail_at) {
      await setFirstMailAt(env.DB, now, to);
    }
  },

  async scheduled(controller, env, ctx) {
    const now = Date.now();
    const cutoff = now - MESSAGE_RETENTION_MS;
    try {
      // Delete messages whose address has expired (honours the configured ttlHours),
      // plus an absolute 48h backstop. (PRIV-03)
      const result = await deleteRetiredMessages(env.DB, cutoff, now);
      console.log('Cleanup: deleted', result.meta.changes, 'old messages');
    } catch (err) {
      console.error('Scheduled cleanup failed');
    }

    // Delete expired Google accounts (the mail address row is kept forever for
    // global uniqueness; only the Google login is removed).
    const gCfg = await resolveGoogleConfig(env);
    if (gCfg) {
      try {
        const { results } = await findExpiredGoogleAddresses(env.DB, now);
        let deleted = 0;
        for (const row of results) {
          const ok = await deleteGoogleUser(gCfg, row.google_login);
          if (ok) {
            await clearGoogleLogin(env.DB, row.address);
            deleted++;
          }
        }
        if (deleted) console.log('Cleanup: deleted', deleted, 'expired Google accounts');
      } catch (err) {
        console.error('Google cleanup failed');
      }
    }
  }
};

// Finalize a response before sending: apply the security headers (strict CSP etc.).
// The footer credit is no longer rewritten per instance — the attribution
// "powered by malziland" is fixed in the views on every instance (owner ruling,
// CI redesign 07/2026): "malziMAIL" names the service, "malziland" is the maker.
export async function finalize(env, response, pathname) {
  return withSecurity(response, pathname);
}

// Re-exports kept for the unit/integration tests that import from this entry.
export { friendlyLogin, randomToken } from './domain/address.js';
export { resolveGoogleConfig } from './domain/google.js';

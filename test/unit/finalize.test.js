// Regression tests for finalize(): security headers on every HTML response and
// the strict CSP. The former footer-credit rewrite is gone — the attribution
// "powered by malziland" is fixed in the views on every instance (owner ruling,
// CI redesign 07/2026) — so finalize must pass bodies through untouched.
import { env } from 'cloudflare:test';
import {beforeEach, describe, it, expect} from 'vitest';
import { finalize } from '../../src/index.js';
import { THEME_INIT_HASH } from '../../src/lib/http.js';
import { THEME_INIT_SNIPPET } from '../../src/views/layout.js';

beforeEach(async () => {
  await env.DB.exec('DELETE FROM settings');
});

const htmlRes = (body) => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });

describe('finalize() — body passthrough + caching', () => {
  it('leaves the HTML body untouched (credit is fixed in the views, no rewrite)', async () => {
    const res = await finalize(env, htmlRes('<div>powered by malziland</div><p>Inhalt</p>'), '/impressum');
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('<div>powered by malziland</div><p>Inhalt</p>');
  });

  it('sets no-store on HTML so browsers cannot serve a stale app shell', async () => {
    const res = await finalize(env, htmlRes('<html>x</html>'), '/');
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('passes non-HTML responses straight through (no body read)', async () => {
    const res = await finalize(env, new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }), '/api/x');
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store'); // stale inbox guard
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('Content-Security-Policy — script hardening', () => {
  const csp = async () => (await finalize(env, htmlRes('<html>x</html>'), '/')).headers.get('content-security-policy');

  it('has NO unsafe-inline anywhere — only the hash-pinned theme-init snippet may run inline', async () => {
    const p = await csp();
    expect(p).toContain(`script-src 'self' '${THEME_INIT_HASH}';`);
    expect(p).toContain("style-src 'self';");
    expect(p).not.toContain("'unsafe-inline'");
  });

  it('theme-init snippet and CSP hash stay in sync (byte-exact)', async () => {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(THEME_INIT_SNIPPET));
    const b64 = btoa(String.fromCharCode(...new Uint8Array(digest)));
    expect('sha256-' + b64).toBe(THEME_INIT_HASH);
  });

  it('keeps the other lock-down directives (object-src none, frame-ancestors none)', async () => {
    const p = await csp();
    expect(p).toContain("object-src 'none';");
    expect(p).toContain("frame-ancestors 'none';");
    expect(p).toContain("base-uri 'self';");
  });

  it('is not applied to non-HTML responses (script files serve without a CSP header)', async () => {
    const res = await finalize(env, new Response('//js', { headers: { 'content-type': 'text/javascript' } }), '/app.js');
    expect(res.headers.get('content-security-policy')).toBeNull();
  });
});

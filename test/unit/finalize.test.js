// Regression tests for finalize(): it reads the HTML body to rewrite the footer
// credit, and MUST always rebuild the response from the read text — otherwise the
// already-consumed stream is reused downstream and the Worker throws
// "This ReadableStream is disturbed". This crashed every asset-served page
// (landing, participant) that lacks the "powered by malzimail" marker.
import { env } from 'cloudflare:test';
import {beforeEach, describe, it, expect} from 'vitest';
import { finalize } from '../../src/index.js';

beforeEach(async () => {
  await env.DB.exec('DELETE FROM settings');
});

const htmlRes = (body) => new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' } });

describe('finalize() footer rewrite — stream-reuse safety', () => {
  it('does not crash on an HTML body WITHOUT the footer marker (not configured)', async () => {
    const res = await finalize(env, htmlRes('<html><body>no footer marker here</body></html>'), '/');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('no footer marker here'); // body still readable
  });

  it('sets no-store on HTML so browsers cannot serve a stale app shell', async () => {
    const res = await finalize(env, htmlRes('<html>x</html>'), '/');
    expect(res.headers.get('cache-control')).toContain('no-store');
  });

  it('rewrites "powered by malziMAIL" -> "malziland" when not configured', async () => {
    const res = await finalize(env, htmlRes('<div>powered by malziMAIL</div>'), '/impressum');
    expect(await res.text()).toContain('powered by malziland');
  });

  it('leaves the credit neutral when an operator IS configured', async () => {
    await env.DB.prepare('INSERT INTO settings (key, value, updated_at) VALUES (?, ?, 0)')
      .bind('operator_owner', 'Maria Muster').run();
    const res = await finalize(env, htmlRes('<div>powered by malziMAIL</div>'), '/impressum');
    const html = await res.text();
    expect(html).toContain('powered by malziMAIL');
    expect(html).not.toContain('powered by malziland');
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

  it('has NO unsafe-inline anywhere — all JS and CSS are externalized', async () => {
    const p = await csp();
    expect(p).toContain("script-src 'self';");
    expect(p).toContain("style-src 'self';");
    expect(p).not.toContain("'unsafe-inline'");
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

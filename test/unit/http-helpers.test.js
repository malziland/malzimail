// Edge cases of the transport helpers in src/lib/http.js. The important one is
// the "response already carries a CSP" path: that is how GET /api/message/:id/frame
// keeps its own, deliberately looser CSP so mail styles still render inside the
// iframe (see CLAUDE.md / AGENTS.md — do not let withSecurity overwrite it).
import { describe, it, expect } from 'vitest';
import { parseCookies, withSecurity, jsonResponse, htmlResponse, THEME_INIT_HASH } from '../../src/lib/http.js';

describe('parseCookies', () => {
  it('returns an empty object for a missing or empty header', () => {
    expect(parseCookies(undefined)).toEqual({});
    expect(parseCookies('')).toEqual({});
  });

  it('reads a valueless cookie as an empty string instead of crashing', () => {
    expect(parseCookies('flag')).toEqual({ flag: '' });
  });

  it('keeps "=" inside a value and url-decodes it', () => {
    expect(parseCookies('a=b=c; s=hello%20world')).toEqual({ a: 'b=c', s: 'hello world' });
  });
});

describe('withSecurity', () => {
  it('adds the strict CSP (with the theme-init hash) to HTML responses', () => {
    const csp = withSecurity(htmlResponse('<p>hi</p>'), '/').headers.get('content-security-policy');
    expect(csp).toContain("script-src 'self' '" + THEME_INIT_HASH + "'");
    expect(csp).not.toContain('unsafe-inline');
  });

  it('never overwrites a CSP the response already set (the mail-iframe route)', () => {
    const own = "default-src 'none'; style-src 'unsafe-inline';";
    const res = new Response('<b>mail</b>', {
      headers: { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': own },
    });
    expect(withSecurity(res, '/api/message/1/frame').headers.get('content-security-policy')).toBe(own);
  });

  it('leaves non-HTML, non-JSON responses cacheable and without a CSP', () => {
    const png = new Response('x', { headers: { 'content-type': 'image/png' } });
    const out = withSecurity(png, '/qr.png');
    expect(out.headers.get('content-security-policy')).toBeNull();
    expect(out.headers.get('pragma')).toBeNull();
    expect(out.headers.get('x-content-type-options')).toBe('nosniff'); // baseline headers still apply
  });

  it('forces JSON responses to be refetched', () => {
    const out = withSecurity(jsonResponse({ ok: true }), '/api/x');
    expect(out.headers.get('cache-control')).toBe('no-store, must-revalidate');
    expect(out.headers.get('expires')).toBe('0');
  });
});

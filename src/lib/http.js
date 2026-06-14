// HTTP response helpers: JSON/HTML responses, security headers, cookie parsing.
// Pure transport layer — no domain imports. (The footer-credit step that needs
// domain knowledge lives in finalize() in src/index.js, the composition root.)

export function parseCookies(cookieHeader) {
  const out = {};
  if (!cookieHeader) return out;
  cookieHeader.split(';').forEach(pair => {
    const [k, ...rest] = pair.trim().split('=');
    if (k) out[k] = decodeURIComponent(rest.join('=') || '');
  });
  return out;
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export function htmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
  });
}

export function withSecurity(response, pathname) {
  const headers = new Headers(response.headers);
  headers.set('strict-transport-security', 'max-age=31536000; includeSubDomains');
  headers.set('x-content-type-options', 'nosniff');
  headers.set('x-frame-options', 'DENY');
  headers.set('referrer-policy', 'strict-origin-when-cross-origin');
  headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
  const ct = headers.get('content-type') || '';
  // Never let the browser serve a stale app shell or stale API data (Safari caches
  // static assets aggressively — a new deploy otherwise wouldn't reach the user).
  // HTML pages and JSON API responses must always be refetched; images (QR) may cache.
  // (The externalized scripts app.js/admin.js are served straight from Cloudflare's
  // asset server with `max-age=0, must-revalidate`, so they revalidate by etag on
  // every load and a deploy reaches the user without passing through here.)
  if (ct.includes('text/html') || ct.includes('application/json')) {
    headers.set('cache-control', 'no-store, must-revalidate');
    headers.set('pragma', 'no-cache');
    headers.set('expires', '0');
  }
  if (!headers.has('content-security-policy')) {
    if (ct.includes('text/html')) {
      // Strict CSP, no 'unsafe-inline' anywhere: all JS is externalized (public/app.js,
      // public/admin.js) and all CSS lives in linked stylesheets (shell/app/landing.css) —
      // markup carries no inline <script>/onclick or style=. Injected inline code cannot
      // execute. (admin.js still toggles modals via element.style.* — CSSOM property
      // setters are not gated by style-src, so that keeps working.)
      headers.set('content-security-policy',
        "default-src 'self'; " +
        "script-src 'self'; " +
        "style-src 'self'; " +
        "img-src 'self' data: blob:; " +
        "font-src 'self'; " +
        "connect-src 'self'; " +
        "frame-src 'self' data:; " +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "frame-ancestors 'none';"
      );
    }
  }
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}


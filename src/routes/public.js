// Public-facing root routing: the participant link landing/app shell.

import { getTrainer } from '../db/queries.js';
import { parseCookies } from '../lib/http.js';

export async function handleRoot(request, env, url) {
  const urlToken = (url.searchParams.get('t') || '').trim().toLowerCase();
  const cookies = parseCookies(request.headers.get('cookie') || '');
  const cookieToken = (cookies['mzm_t'] || '').trim().toLowerCase();
  const token = urlToken || cookieToken;

  if (!token) return serveAsset(env, request, '/landing.html');

  const trainer = await getTrainer(env.DB, token);
  if (!trainer || !trainer.enabled) return serveAsset(env, request, '/landing.html');

  const now = Date.now();
  if ((trainer.active_until || 0) <= now) {
    // The link is stopped/expired (dead) -> send the participant to the start page,
    // not a dead-end notice. (Stop wipes everything, so there is no grace period.)
    return serveAsset(env, request, '/landing.html');
  }

  const response = await serveAsset(env, request, '/app.html');
  if (urlToken && urlToken === token) {
    const headers = new Headers(response.headers);
    headers.append('set-cookie',
      `mzm_t=${encodeURIComponent(token)}; Path=/; Max-Age=86400; Secure; SameSite=Lax; HttpOnly`);
    return new Response(response.body, { status: response.status, headers });
  }
  return response;
}

async function serveAsset(env, request, path) {
  if (!env.ASSETS) return new Response('Not found', { status: 404 });
  const u = new URL(request.url);
  u.pathname = path;
  u.search = '';
  const res = await env.ASSETS.fetch(new Request(u, { method: 'GET' }));
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/html')) {
    const headers = new Headers(res.headers);
    headers.set('cache-control', 'no-store, no-cache, must-revalidate, max-age=0');
    headers.set('pragma', 'no-cache');
    headers.set('expires', '0');
    return new Response(res.body, { status: res.status, headers });
  }
  return res;
}

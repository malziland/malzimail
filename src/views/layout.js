// Shared HTML shell for the server-rendered pages (admin, legal, setup, login).
// All styling lives in the external stylesheets (public/shell.css + /tokens.css)
// so the pages run under a strict Content-Security-Policy (style-src 'self').
// Theme: light is default; the head snippet below applies a stored dark choice
// before first paint. It is the ONLY inline script and is allow-listed in the
// CSP by its SHA-256 hash (THEME_INIT_HASH in src/lib/http.js) — keep both in
// sync, and keep the bytes identical to public/app.html / public/landing.html.

export const THEME_INIT_SNIPPET =
  "(function(){try{if(localStorage.getItem('ml_theme')==='dark')document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();";

// Sun/moon toggle (shown on every page, top right). Handled by public/theme.js.
const THEME_TOGGLE = `<button class="theme-toggle" type="button" data-action="toggle-theme" aria-label="Farbschema wechseln" title="Hell/Dunkel umschalten">
        <svg class="icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
        <svg class="icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4"></circle><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"></path></svg>
      </button>`;

// m watermark (brand rule: at most once per surface, bottom right, edge-cropped).
const WATERMARK = `<div class="brand-watermark" aria-hidden="true">
  <img class="wm-light" src="/img/brand/malziland-m-petrol.png" alt="">
  <img class="wm-dark" src="/img/brand/malziland-m-white.png" alt="">
</div>`;

function htmlShell(title, body, opts = {}) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
<meta name="theme-color" content="#f9f7f4">
<title>${escape(title)}</title>
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="stylesheet" href="/shell.css">
<script>${THEME_INIT_SNIPPET}</script>
</head>
<body>
<header class="topbar">
  <div class="topbar__inner">
    <a class="brand" href="/"><span class="brand__mark">malzi<span class="gradient">MAIL</span></span></a>
    <div class="topbar__actions">
      ${THEME_TOGGLE}
    </div>
  </div>
</header>
<main class="shell ${opts.legal ? 'legal' : ''}">
${body}
</main>
${WATERMARK}
<footer class="footer">
  <div class="footer__inner">
    <span>powered by malziland</span>
    <span class="footer__sep">·</span>
    <a href="/impressum">Impressum</a>
    <span class="footer__sep">·</span>
    <a href="/datenschutz">Datenschutz</a>
    <span class="footer__sep">·</span>
    <a href="/nutzungsbedingungen">Nutzungsbedingungen</a>
  </div>
</footer>
<script src="/theme.js"></script>
${opts.script ? `<script src="${opts.script}"></script>` : ''}
</body>
</html>`;
}

function escape(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

// Shared by every view module.
export { htmlShell, escape };

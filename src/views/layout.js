// Shared HTML shell for the server-rendered pages (admin, legal, setup, login).
// All styling lives in the external stylesheet public/shell.css so the pages can
// run under a strict Content-Security-Policy (style-src 'self', no inline <style>).

function htmlShell(title, body, opts = {}) {
  return `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow,noarchive,nosnippet">
<title>${escape(title)}</title>
<link rel="stylesheet" href="/shell.css">
</head>
<body>
<header class="topbar">
  <div class="topbar__inner">
    <a class="brand" href="/"><span class="brand__mark">malzi<span class="gradient">MAIL</span></span></a>
  </div>
</header>
<main class="shell ${opts.legal ? 'legal' : ''}">
${body}
</main>
<footer class="footer">
  <div>powered by malziMAIL</div>
  <div class="footer__links">
    <a href="/impressum">Impressum</a>
    <span class="footer__sep">·</span>
    <a href="/datenschutz">Datenschutz</a>
    <span class="footer__sep">·</span>
    <a href="/nutzungsbedingungen">Nutzungsbedingungen</a>
  </div>
</footer>
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

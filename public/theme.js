// malziland-CI theme toggle: light is the default; the choice persists in
// localStorage "ml_theme" and is applied via html[data-theme="dark"] + CSS
// custom properties. The tiny no-flash init snippet lives inline in each page
// <head> and is allow-listed in the CSP via its SHA-256 hash (no unsafe-inline).
(function () {
  'use strict';
  document.addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-action="toggle-theme"]') : null;
    if (!btn) return;
    var dark = document.documentElement.getAttribute('data-theme') === 'dark';
    var next = dark ? 'light' : 'dark';
    if (next === 'dark') document.documentElement.setAttribute('data-theme', 'dark');
    else document.documentElement.removeAttribute('data-theme');
    try { localStorage.setItem('ml_theme', next); } catch (err) { /* private mode etc. */ }
  });
})();

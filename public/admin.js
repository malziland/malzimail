// malziMAIL admin UI behaviour — externalized from the server-rendered HTML so the
// admin pages can run under a strict Content-Security-Policy (script-src 'self',
// no 'unsafe-inline'). All interactive elements carry data-* attributes; this file
// wires them up via one delegated click listener plus a couple of element hooks.
(function () {
  'use strict';

  function show(id) { var el = document.getElementById(id); if (el) el.style.display = 'flex'; }
  function hide(id) { var el = document.getElementById(id); if (el) el.style.display = 'none'; }

  // Stop the workshop: POST action=stop, swap the buttons for a spinner, reload.
  function runStop() {
    var a = document.getElementById('stopActions'), s = document.getElementById('stopSpinner');
    if (a) a.style.display = 'none';
    if (s) s.style.display = 'flex';
    fetch('/admin', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'action=stop'
    })
      .then(function (r) { return r.json().catch(function () { return {}; }); })
      .then(function (d) {
        // On a clean stop just reload; if Google was unreachable / some accounts
        // failed, carry the message as a flash so the admin actually sees it.
        if (d && (d.googleError || d.failed)) {
          location.href = '/admin?flash=' + encodeURIComponent(d.message || 'Workshop gestoppt.');
        } else {
          location.href = '/admin';
        }
      })
      .catch(function () { location.href = '/admin'; });
  }

  // Prevent a double-click on "Workshop starten" from POSTing twice (which could
  // briefly create two active links). Disable the button on submit.
  (function () {
    var startForm = document.getElementById('startForm');
    if (!startForm) return;
    startForm.addEventListener('submit', function () {
      var b = startForm.querySelector('button[type="submit"]');
      if (b) b.disabled = true;
    });
  })();

  // One delegated listener handles every button. Modals close ONLY via their buttons
  // (open-modal / close-modal) — a click on the dimmed backdrop must NOT close them.
  document.addEventListener('click', function (e) {
    var t = e.target;
    var btn = t.closest ? t.closest('[data-action]') : null;
    if (!btn) return;
    var action = btn.getAttribute('data-action');
    if (action === 'open-modal') {
      show(btn.getAttribute('data-target'));
    } else if (action === 'close-modal') {
      hide(btn.getAttribute('data-target'));
    } else if (action === 'copy') {
      var input = btn.previousElementSibling;
      if (input && navigator.clipboard) {
        navigator.clipboard.writeText(input.value).then(function () {
          btn.textContent = '✓ kopiert';
          setTimeout(function () { btn.textContent = 'Kopieren'; }, 1500);
        });
      }
    } else if (action === 'stop') {
      runStop();
    }
  });

  // Live background refresh of the dashboard status — keeps the Google counter AND
  // the System-Check current without a page reload (e.g. "Mail-Empfang" flips as
  // soon as a mail arrives). Runs whenever the dashboard is shown.
  (function () {
    var gActive = document.getElementById('g-active');
    var gFree = document.getElementById('g-free');
    var hasSysCheck = !!document.getElementById('sc-lastmail');
    if (!gActive && !hasSysCheck) return; // not on the dashboard
    var scKeys = ['maildomain', 'enckey', 'db', 'lastmail'];
    function tick() {
      if (document.hidden) return;
      fetch('/admin?fragment=google-count', { headers: { accept: 'application/json' } })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d) return;
          if (gActive && d.active != null) gActive.textContent = d.active;
          if (gFree && d.free != null) gFree.textContent = d.free;
          if (d.sc) {
            scKeys.forEach(function (k) {
              var el = document.getElementById('sc-' + k);
              // d.sc[k] is server-generated, trusted markup (status spans, no scripts).
              if (el && d.sc[k] != null) el.innerHTML = d.sc[k];
            });
          }
        })
        .catch(function () {});
    }
    setInterval(tick, 15000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) tick(); });
  })();

  // Setup step 1: confirm the two passwords match before submitting.
  var pwForm = document.getElementById('setupPwForm');
  if (pwForm) {
    pwForm.addEventListener('submit', function (e) {
      if (pwForm.password.value !== pwForm.password2.value) {
        var m = document.getElementById('pw-mismatch');
        if (m) m.style.display = 'block';
        e.preventDefault();
      }
    });
  }

  // Flash message is passed via ?flash=… . Strip it from the URL after the first
  // render so a reload no longer re-shows the same confirmation (it used to stick
  // until the next logout). The message stays visible on the current page.
  if (window.history && window.history.replaceState && location.search.indexOf('flash=') !== -1) {
    var fu = new URL(location.href);
    fu.searchParams.delete('flash');
    window.history.replaceState({}, '', fu.pathname + fu.search + fu.hash);
  }

  // Setup step 3: load the Service-Account JSON by drag&drop or file-pick (reads the
  // file's CONTENTS into the textarea) — or the operator pastes the JSON text directly.
  (function () {
    var drop = document.getElementById('sa-drop');
    var fileInput = document.getElementById('sa-file');
    var area = document.getElementById('sa-key');
    var txt = document.getElementById('sa-drop-text');
    if (!drop || !fileInput || !area) return;

    function setStatus(msg, ok) {
      if (txt) txt.textContent = msg;
      drop.classList.remove('drop-zone--ok', 'drop-zone--bad');
      if (ok === true) drop.classList.add('drop-zone--ok');
      else if (ok === false) drop.classList.add('drop-zone--bad');
    }
    function loadFile(f) {
      if (!f) return;
      var reader = new FileReader();
      reader.onload = function () {
        var content = String(reader.result || '');
        try {
          var obj = JSON.parse(content);
          if (!obj.client_email || !obj.private_key) throw new Error('fields');
          area.value = content;
          setStatus('✓ Datei geladen: ' + f.name, true);
        } catch (err) {
          setStatus('✗ Keine gültige Service-Account-JSON-Datei (client_email/private_key fehlen).', false);
        }
      };
      reader.onerror = function () { setStatus('✗ Datei konnte nicht gelesen werden.', false); };
      reader.readAsText(f);
    }

    // The drop zone is a <label for="sa-file">, so a click opens the file picker
    // natively (works even without JS). We only react to the resulting selection.
    fileInput.addEventListener('change', function () { loadFile(fileInput.files && fileInput.files[0]); });

    // Prevent the browser from navigating away when a file is dropped anywhere on
    // the page, and accept a drop both on the zone and on the textarea.
    ['dragenter', 'dragover'].forEach(function (ev) {
      document.addEventListener(ev, function (e) { e.preventDefault(); });
    });
    [drop, area].forEach(function (el) {
      el.addEventListener('dragover', function () { drop.classList.add('drop-zone--hover'); });
      el.addEventListener('dragleave', function () { drop.classList.remove('drop-zone--hover'); });
    });
    document.addEventListener('drop', function (e) {
      e.preventDefault();
      drop.classList.remove('drop-zone--hover');
      var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
      if (f) loadFile(f);
    });
  })();
})();

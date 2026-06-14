// Pure view functions rendered in every branch (status box, Google status,
// counter, modal states) — the cheapest way to cover the conditional markup.
import {describe, it, expect} from 'vitest';
import { renderWorkshopDashboard, renderGoogleModal } from '../../src/pages.js';

const base = { serviceName: 'malziMAIL', googleStats: { active: 1, limit: 50, free: 49 }, now: Date.now(), origin: 'https://x.test', google: {} };
const running = { token: 'kurs', name: 'Kurs', enabled: 1, active_until: Date.now() + 3_600_000 };
const stopped = { token: 'kurs', name: 'Kurs', enabled: 1, active_until: 0 };

describe('renderWorkshopDashboard — states', () => {
  it('no workshop -> "Kein Workshop aktiv" + start button', () => {
    const h = renderWorkshopDashboard({ ...base, workshop: null, googleActive: false });
    expect(h).toContain('Kein Workshop aktiv');
    expect(h).toContain('Workshop starten');
  });
  it('running + Google verbunden -> läuft + verbunden + live counter + stop', () => {
    const h = renderWorkshopDashboard({ ...base, workshop: running, googleActive: true, googleTestedOk: true, flash: 'Hinweis' });
    expect(h).toContain('Workshop läuft');
    expect(h).toContain('● verbunden');
    expect(h).toContain('Google-Konten aktiv');
    expect(h).toContain('Workshop stoppen');
    expect(h).toContain('Hinweis'); // flash rendered
  });
  it('running + test failed -> fehlgeschlagen', () => {
    expect(renderWorkshopDashboard({ ...base, workshop: running, googleActive: true, googleTestedOk: false }))
      .toContain('Verbindung fehlgeschlagen');
  });
  it('running + configured-but-untested -> eingerichtet', () => {
    expect(renderWorkshopDashboard({ ...base, workshop: running, googleActive: true, googleTestedOk: null }))
      .toContain('● eingerichtet');
  });
  it('running + no Google -> nicht eingerichtet, no counter', () => {
    const h = renderWorkshopDashboard({ ...base, workshop: running, googleActive: false });
    expect(h).toContain('nicht eingerichtet');
    expect(h).not.toContain('Google-Konten aktiv');
  });
  it('stopped workshop -> "Kein Workshop aktiv"', () => {
    expect(renderWorkshopDashboard({ ...base, workshop: stopped, googleActive: false })).toContain('Kein Workshop aktiv');
  });
  it('System-Check: warns on missing config, shows last-mail time when present', () => {
    const bad = renderWorkshopDashboard({ ...base, workshop: running, googleActive: false, selfCheck: { mailDomainSet: false, encKeySet: false, lastMailAt: null } });
    expect(bad).toContain('System-Check');
    expect(bad).toContain('UNVERSCHLÜSSELT'); // missing MAIL_ENCRYPTION_KEY warning
    expect(bad).toContain('noch keine E-Mail empfangen');
    const good = renderWorkshopDashboard({ ...base, workshop: running, googleActive: false, selfCheck: { mailDomainSet: true, encKeySet: true, lastMailAt: 1718000000000 } });
    expect(good).toContain('zuletzt 2024-06-10'); // formatted received time (UTC)
    expect(good).not.toContain('UNVERSCHLÜSSELT');
  });
});

describe('renderGoogleModal — states', () => {
  it('not configured -> "Noch nicht eingerichtet"', () => {
    expect(renderGoogleModal({ source: 'none' })).toContain('Noch nicht eingerichtet');
  });
  it('configured (secret) -> "Google ist eingerichtet"', () => {
    expect(renderGoogleModal({ source: 'secret', hasKey: true })).toContain('Google ist eingerichtet');
  });
  it('successful test result box', () => {
    expect(renderGoogleModal({ source: 'settings', hasKey: true, modalTest: { ok: true } })).toContain('Verbindung erfolgreich');
  });
  it('failed test result box shows step + HTTP status', () => {
    const h = renderGoogleModal({ source: 'settings', modalTest: { ok: false, step: 'list', status: 403, detail: 'denied' } });
    expect(h).toContain('Verbindung fehlgeschlagen');
    expect(h).toContain('list');
    expect(h).toContain('403');
  });
  it('form error is shown and the modal opens', () => {
    const h = renderGoogleModal({ source: 'none', formError: 'Kein gültiger Service-Account-JSON', modalOpen: true });
    expect(h).toContain('Kein gültiger Service-Account-JSON');
    expect(h).toContain('modal-overlay is-open'); // modalOpen -> visible (class, no inline style)
  });
});

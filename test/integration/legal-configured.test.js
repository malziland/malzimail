// Renders the legal pages for a CONFIGURED operator (the other branch of
// resolveLegal): own data only, no foreign registry numbers, and the
// company-vs-person headline variants.
import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import {beforeEach, describe, it, expect} from 'vitest';
import worker from '../../src/index.js';

beforeEach(async () => { await env.DB.exec('DELETE FROM settings'); });

async function setOp(values) {
  for (const [k, v] of Object.entries(values)) {
    await env.DB.prepare('INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, 0)').bind(k, v).run();
  }
}
async function get(path) {
  const req = new Request('https://example.test' + path);
  const ctx = createExecutionContext();
  const res = await worker.fetch(req, { ...env }, ctx);
  await waitOnExecutionContext(ctx);
  return res.text();
}
const BASE = {
  operator_owner: 'Maria Muster', operator_service_name: 'kurspost',
  operator_street: 'Weg 1', operator_zip: '4020', operator_city: 'Linz',
  operator_email: 'office@example.test', operator_legal_date: '1. Juni 2026',
};

describe('legal pages — configured operator', () => {
  it('Impressum with a company: company is the headline + "Inhaber" line, no foreign registry', async () => {
    await setOp({ ...BASE, operator_company: 'Muster GmbH' });
    const imp = await get('/impressum');
    expect(imp).toContain('Muster GmbH');
    expect(imp).toContain('Inhaber: Maria Muster');
    expect(imp).not.toContain('ATU76410108'); // COMPANY (malziland) registry must not leak
    expect(imp).not.toContain('Unternehmensdaten');
  });

  it('Impressum without a company: the person is the headline, no "Inhaber" line', async () => {
    await setOp(BASE); // no operator_company
    const imp = await get('/impressum');
    expect(imp).toContain('Maria Muster');
    expect(imp).not.toContain('Inhaber: Maria Muster');
  });

  it('Datenschutz + Nutzungsbedingungen use the operator service name', async () => {
    await setOp({ ...BASE, operator_company: 'Muster GmbH' });
    expect(await get('/datenschutz')).toContain('kurspost');
    expect(await get('/nutzungsbedingungen')).toContain('kurspost');
  });
});

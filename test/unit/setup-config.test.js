// Unit tests for the `npm run setup` placeholder filler (scripts/lib/fill-config.mjs).
// Pure string logic — no Node APIs — so it runs in the workers pool like any other test.
import { describe, it, expect } from 'vitest';
import { fillWranglerConfig, remainingPlaceholders } from '../../scripts/lib/fill-config.mjs';

const TPL = [
  '"name": "<<dein-worker-name>>"',
  '"MAIL_DOMAIN": "<<deine-domain.at>>"',
  '"GOOGLE_ADMIN_SUBJECT": "<<admin@id.deine-domain.at>>"',
  '"database_name": "<<dein-d1-name>>"',
  '"database_id": "<<deine-d1-database-id>>"',
  '"dev_id": "<<deine-dev-d1-database-id>>"',
].join('\n');

const full = {
  workerName: 'wm', domain: 'meine-domain.test', googleAdminSubject: 'admin@id.meine-domain.test',
  d1Name: 'wm', d1Id: 'abc-123', devD1Id: 'def-456',
};

describe('fillWranglerConfig', () => {
  it('replaces every placeholder when all answers are given', () => {
    const out = fillWranglerConfig(TPL, full);
    expect(remainingPlaceholders(out)).toEqual([]);
    expect(out).toContain('"name": "wm"');
    expect(out).toContain('"MAIL_DOMAIN": "meine-domain.test"');
    expect(out).toContain('"database_id": "abc-123"');
    expect(out).not.toContain('malzimail'); // no operator-specific leftovers
  });

  it('replaces a token everywhere it appears (domain used in several fields)', () => {
    const tpl = '<<deine-domain.at>> ... <<deine-domain.at>>';
    expect(fillWranglerConfig(tpl, { domain: 'x.test' })).toBe('x.test ... x.test');
  });

  it('leaves a placeholder visible when its answer is empty (no silent blanks)', () => {
    const out = fillWranglerConfig(TPL, { workerName: 'wm' });
    expect(remainingPlaceholders(out)).toContain('<<deine-domain.at>>');
    expect(out).toContain('"name": "wm"');
  });
});

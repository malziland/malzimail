// Automated accessibility check (UI profile, ADR-0001): axe-core scans the two
// participant-facing pages. jsdom performs no layout/paint, so purely visual
// rules (color-contrast) are disabled here — contrast is covered by the CI
// design tokens (docs/design-ci.md) and the manual smoke test in
// docs/funktionstest.md. Everything structural (labels, roles, names, lang,
// landmarks, button/link names) is enforced.
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import axe from 'axe-core';

const AXE_OPTIONS = {
  rules: { 'color-contrast': { enabled: false } }, // jsdom cannot compute rendered colors
};

async function scanFile(relPath) {
  const html = readFileSync(new URL('../../' + relPath, import.meta.url), 'utf8');
  document.open();
  document.write(html);
  document.close();
  const results = await axe.run(document, AXE_OPTIONS);
  return results.violations;
}

function describeViolations(violations) {
  return violations
    .map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)
    .join('\n');
}

describe('axe-core accessibility scan (structural rules)', () => {
  it('public/app.html (participant app) has no violations', async () => {
    const violations = await scanFile('public/app.html');
    expect(violations, describeViolations(violations)).toEqual([]);
  });

  it('public/landing.html (public landing page) has no violations', async () => {
    const violations = await scanFile('public/landing.html');
    expect(violations, describeViolations(violations)).toEqual([]);
  });
});

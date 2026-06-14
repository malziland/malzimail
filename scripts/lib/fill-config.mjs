// Pure helper behind `npm run setup`: fill the wrangler.example.jsonc placeholders
// with the operator's answers. No Node APIs here, so it stays unit-testable.

// Placeholder token in the template  ->  key in the `answers` object.
export const PLACEHOLDERS = {
  '<<dein-worker-name>>': 'workerName',
  '<<deine-domain.at>>': 'domain',
  '<<admin@id.deine-domain.at>>': 'googleAdminSubject',
  '<<dein-d1-name>>': 'd1Name',
  '<<deine-d1-database-id>>': 'd1Id',
  '<<deine-dev-d1-database-id>>': 'devD1Id',
};

// Replace every known placeholder for which a non-empty answer exists. Placeholders
// without an answer are left untouched so they stay visible (and `remainingPlaceholders`
// can report them) instead of turning into an empty string.
export function fillWranglerConfig(template, answers = {}) {
  let out = template;
  for (const [token, key] of Object.entries(PLACEHOLDERS)) {
    const value = answers[key];
    if (value == null || value === '') continue;
    out = out.split(token).join(value);
  }
  return out;
}

// Any `<<...>>` markers still present (unique). Empty array = fully filled.
export function remainingPlaceholders(text) {
  return [...new Set(text.match(/<<[^>]+>>/g) || [])];
}

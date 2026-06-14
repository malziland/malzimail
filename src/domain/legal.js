// Context for the legal pages (Impressum / Datenschutz / Nutzungsbedingungen)
// and the footer credit. Two modes:
//   configured:false → no operator data captured (e.g. the production instance);
//     the renderers fall back to the built-in COMPANY defaults unchanged.
//   configured:true  → operator entered their own data in the setup assistant;
//     the renderers use ONLY that data (no foreign registry numbers leak),
//     service name / mail domain / "Stand"-date come from settings.

import { getSetting, ttlHours } from './settings.js';
import { resolveGoogleConfig } from './google.js';

export async function getLegalContext(env, origin = '') {
  // No silent fallback to another operator's domain — a missing MAIL_DOMAIN shows
  // a visible "not configured" marker in the legal texts instead (and must not throw,
  // or every Impressum/Datenschutz request would crash).
  const mailDomain = env.MAIL_DOMAIN || 'NICHT-KONFIGURIERT.invalid';
  const lifetimeHours = await ttlHours(env);
  // When Google is configured, participants also get a Google account -> their
  // data goes to Google LLC. The privacy page must then name Google as a recipient.
  const googleActive = !!(await resolveGoogleConfig(env));
  const owner = await getSetting(env, 'operator_owner');
  if (!owner) return { configured: false, mailDomain, origin, lifetimeHours, googleActive };
  return {
    configured: true,
    mailDomain,
    origin,
    lifetimeHours,
    googleActive,
    serviceName: (await getSetting(env, 'operator_service_name')) || mailDomain,
    name: owner,
    owner,
    company: (await getSetting(env, 'operator_company')) || '',
    street: (await getSetting(env, 'operator_street')) || '',
    zip: (await getSetting(env, 'operator_zip')) || '',
    city: (await getSetting(env, 'operator_city')) || '',
    country: 'Österreich',
    email: (await getSetting(env, 'operator_email')) || '',
    legalDate: (await getSetting(env, 'operator_legal_date')) || '',
  };
}

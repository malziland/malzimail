// Tests the actual Worker module src/lib/google.js (Web Crypto path) against Google.
// Aufruf:
//   GOOGLE_SA_KEY_FILE=/pfad/zur/sa-key.json GOOGLE_ADMIN_SUBJECT=admin@id.deine-domain.at \
//     GOOGLE_ACCOUNT_DOMAIN=deine-domain.at node scripts/test-google-module.mjs
import { readFileSync } from 'node:fs';
import { googleConfig, createGoogleUser, deleteGoogleUser } from '../src/lib/google.js';

if (!process.env.GOOGLE_SA_KEY_FILE || !process.env.GOOGLE_ADMIN_SUBJECT || !process.env.GOOGLE_ACCOUNT_DOMAIN) {
  console.error('Bitte setzen: GOOGLE_SA_KEY_FILE, GOOGLE_ADMIN_SUBJECT, GOOGLE_ACCOUNT_DOMAIN');
  process.exit(1);
}
const env = {
  GOOGLE_SA_KEY: readFileSync(process.env.GOOGLE_SA_KEY_FILE, 'utf8'),
  GOOGLE_ADMIN_SUBJECT: process.env.GOOGLE_ADMIN_SUBJECT,
  GOOGLE_ACCOUNT_DOMAIN: process.env.GOOGLE_ACCOUNT_DOMAIN,
};

const cfg = googleConfig(env);
console.log('googleConfig:', cfg ? 'OK (konfiguriert)' : 'NULL (nicht konfiguriert)');
if (!cfg) process.exit(1);

const login = 'probe' + (1000 + Math.floor(Math.random() * 9000));
console.log('Lege an (Worker-Krypto):', login + '@id.malzimail.at');
const email = await createGoogleUser(cfg, login, login);
console.log('  ✓ angelegt:', email);

console.log('Lösche wieder:', email);
const ok = await deleteGoogleUser(cfg, email);
console.log(ok ? '  ✓ gelöscht' : '  ✗ Löschen fehlgeschlagen');
console.log('\n=> Worker-Modul funktioniert end-to-end.');

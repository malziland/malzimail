// Interaktiver Konfigurator: erzeugt `wrangler.jsonc` aus der Vorlage, ohne dass du
// JSON von Hand bearbeiten musst. Aufruf:  npm run setup
//
// Setzt KEINE Secrets (die gibst du selbst via `wrangler secret put` ein) und ruft
// kein `wrangler` auf — am Ende werden die nächsten Befehle mit deinen Werten gezeigt.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { fillWranglerConfig, remainingPlaceholders } from './lib/fill-config.mjs';

const rl = createInterface({ input, output });
const ask = async (q, def = '') => {
  const a = (await rl.question(def ? `${q} [${def}]: ` : `${q}: `)).trim();
  return a || def;
};
const yes = (s) => /^(j|ja|y|yes)$/i.test(s);

console.log('\n  malziMAIL — Einrichtung der wrangler.jsonc\n  ' + '─'.repeat(44) + '\n');

if (existsSync('wrangler.jsonc')) {
  if (!yes(await ask('wrangler.jsonc existiert schon — überschreiben? (j/N)', 'n'))) {
    console.log('Abgebrochen — nichts geändert.');
    rl.close();
    process.exit(0);
  }
}
if (!existsSync('wrangler.example.jsonc')) {
  console.error('Fehler: wrangler.example.jsonc nicht gefunden. Bist du im Projektordner?');
  rl.close();
  process.exit(1);
}
const template = readFileSync('wrangler.example.jsonc', 'utf8');

const workerName = await ask('Worker-Name (Kleinbuchstaben, z. B. malzimail)', 'malzimail');
const domain = await ask('Deine Domain (z. B. meine-domain.at)');
const d1Name = await ask('Name der D1-Datenbank', workerName);

console.log('\n  → Falls die Datenbank noch nicht existiert, in einem anderen Terminal:');
console.log(`      npx wrangler d1 create ${d1Name}`);
console.log('    und die angezeigte "database_id" hierher kopieren.\n');
const d1Id = await ask('D1 database_id');

const useGoogle = yes(await ask('Optionale Google-Login-Funktion nutzen? (j/N)', 'n'));
const googleAdminSubject = useGoogle
  ? await ask('Google-Admin-Konto', domain ? `admin@id.${domain}` : '')
  : (domain ? `admin@id.${domain}` : '');

const useDev = yes(await ask('Separate Test-Instanz (-dev) einrichten? (meist nein) (j/N)', 'n'));
const devD1Id = useDev ? await ask('database_id der -dev-Datenbank') : 'NUR-FALLS-TESTINSTANZ-BENOETIGT';

rl.close();

const out = fillWranglerConfig(template, { workerName, domain, d1Name, d1Id, devD1Id, googleAdminSubject });
writeFileSync('wrangler.jsonc', out);

const left = remainingPlaceholders(out);
console.log('\n  ✓ wrangler.jsonc geschrieben.');
if (left.length) console.log('  ⚠ Noch offene Platzhalter:', left.join(', '), '— bitte von Hand ersetzen.');
console.log('\n  Nächste Schritte:');
console.log(`    1. Tabellen anlegen:   npx wrangler d1 migrations apply ${d1Name} --remote`);
console.log('    2. Schlüssel setzen (PFLICHT — lang & zufällig, z. B. via "openssl rand -base64 32"):');
console.log('         npx wrangler secret put MAIL_ENCRYPTION_KEY');
console.log('       (Admin-Passwort NICHT hier setzen — der Setup-Assistent im Browser fragt es beim 1. Aufruf.)');
console.log('    3. Veröffentlichen:    npx wrangler deploy');
console.log('    4. Mail-Empfang im Cloudflare-Dashboard aktivieren (Teil F der Anleitung).');
console.log('\n  Danach /admin im Browser öffnen → Setup-Assistent führt dich weiter.\n');

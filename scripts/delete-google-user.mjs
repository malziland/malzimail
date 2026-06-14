// Löscht automatisch ein Google-Konto (Admin SDK Directory API).
// Aufruf:
//   GOOGLE_SA_KEY_FILE=/pfad/zur/sa-key.json GOOGLE_ADMIN_SUBJECT=admin@id.deine-domain.at \
//     node scripts/delete-google-user.mjs [email]
import { readFileSync } from 'node:fs';
import { createSign } from 'node:crypto';

const KEY_PATH = process.env.GOOGLE_SA_KEY_FILE;
const SUBJECT  = process.env.GOOGLE_ADMIN_SUBJECT;
const SCOPE    = 'https://www.googleapis.com/auth/admin.directory.user';
if (!KEY_PATH || !SUBJECT) {
  console.error('Bitte setzen: GOOGLE_SA_KEY_FILE=<pfad-zur-sa-key.json> und GOOGLE_ADMIN_SUBJECT=<admin@deine-domain>');
  process.exit(1);
}

const email = process.argv[2] || ('test1@' + SUBJECT.split('@')[1]);
const key = JSON.parse(readFileSync(KEY_PATH, 'utf8'));

const b64url = (input) =>
  Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = b64url(JSON.stringify({
    iss: key.client_email, sub: SUBJECT, scope: SCOPE,
    aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600,
  }));
  const signingInput = `${header}.${claim}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(key.private_key)
    .toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${signature}`,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error('Token-Fehler: ' + JSON.stringify(data));
  return data.access_token;
}

(async () => {
  console.log('1) Hole Zugangstoken vom Roboter …');
  const token = await getAccessToken();
  console.log('   ✓ Token erhalten.');
  console.log(`2) Lösche Konto: ${email} …`);
  const res = await fetch(
    'https://admin.googleapis.com/admin/directory/v1/users/' + encodeURIComponent(email),
    { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  if (res.status === 204) {
    console.log('\n==============================');
    console.log(' ✅  KONTO AUTOMATISCH GELÖSCHT');
    console.log('==============================');
    console.log(' ' + email);
    console.log('==============================');
  } else {
    const data = await res.json().catch(() => ({}));
    throw new Error('Lösch-Fehler (' + res.status + '): ' + JSON.stringify(data));
  }
})().catch((e) => { console.error('\n❌ FEHLER: ' + e.message); process.exit(1); });

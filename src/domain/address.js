// Address & participant-link domain: the friendly login/word lists, the token
// minting, the request/URL parsers, and the address-lifecycle constants.

import { randomInt, randomString } from '../lib/util.js';

// Friendly login words (>=4 letters, so word + 4 digits is always >=8 chars,
// which Google requires for a password). Login & password are the same string.
const FRIENDLY_WORDS = [
  'fuchs', 'adler', 'biber', 'igel', 'lemur', 'tiger', 'panda', 'otter',
  'dachs', 'luchs', 'falke', 'rabe', 'wolf', 'baer', 'hase', 'eule',
  'specht', 'kranich', 'molch', 'robbe', 'delfin', 'krebs', 'taube', 'gans'
];
export function friendlyLogin() {
  const word = FRIENDLY_WORDS[randomInt(FRIENDLY_WORDS.length)];
  const num = 1000 + randomInt(9000); // 4 digits -> total >=8 chars
  return `${word}${num}`;
}

// Animals for the participant LINK token — deliberately DISJOINT from
// FRIENDLY_WORDS (the e-mail animals) so the link and the addresses never look
// alike. The token is animal + 4 digits + '-' + 3 random chars (variant B):
// fun/readable, but not guessable (the link is the only gate to create accounts).
const LINK_WORDS = [
  'hirsch', 'marder', 'reh', 'gams', 'biene', 'hummel', 'libelle', 'schnecke',
  'frosch', 'storch', 'reiher', 'schwan', 'ente', 'pinguin', 'fink', 'meise',
  'star', 'schwalbe', 'lerche', 'wiesel', 'seehund', 'orca', 'hummer', 'kauz',
];
export function randomToken() {
  const word = LINK_WORDS[randomInt(LINK_WORDS.length)];
  const num = 1000 + randomInt(9000);
  const suffix = randomString(3); // crypto-random, RANDOM_CHARS alphabet
  return `${word}${num}-${suffix}`;
}

export const ADDRESS_PREFIX = 'ws-';
export const RANDOM_LENGTH = 8;
export const MAX_GENERATION_ATTEMPTS = 10;
export const MESSAGES_LIMIT = 100;
export const GRACE_PERIOD_MS = 10 * 60 * 1000;
export const MESSAGE_RETENTION_MS = 48 * 60 * 60 * 1000; // keep mails as long as the address can live
// A started workshop runs until the trainer stops it (no fixed runtime). We model
// "running" as active_until set far in the future; "stopped" as 0.
export const ALWAYS_ON_UNTIL = 4102444800000; // 2100-01-01

export function readToken(request, url) {
  let raw = url.searchParams.get('t');
  if (!raw) raw = request.headers.get('x-trainer-token');
  if (!raw) return null;
  return raw.trim().toLowerCase();
}

export function paramAddress(url) {
  const raw = url.searchParams.get('to');
  if (!raw) return null;
  return raw.trim().toLowerCase();
}

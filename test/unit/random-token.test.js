// The participant link token: animal + 4 digits + '-' + 3 random chars (variant B),
// using a word list disjoint from the e-mail address animals.
import {describe, it, expect} from 'vitest';
import { randomToken } from '../../src/index.js';

const EMAIL_ANIMALS = [
  'fuchs', 'adler', 'biber', 'igel', 'lemur', 'tiger', 'panda', 'otter',
  'dachs', 'luchs', 'falke', 'rabe', 'wolf', 'baer', 'hase', 'eule',
  'specht', 'kranich', 'molch', 'robbe', 'delfin', 'krebs', 'taube', 'gans',
];

describe('randomToken (participant link)', () => {
  it('is animal + 4 digits + "-" + 3 chars and never reuses an e-mail animal', () => {
    for (let i = 0; i < 80; i++) {
      const t = randomToken();
      expect(t).toMatch(/^[a-z]+[0-9]{4}-[a-z0-9]{3}$/);
      const animal = t.match(/^[a-z]+/)[0];
      expect(EMAIL_ANIMALS).not.toContain(animal);
    }
  });

  it('rotates (consecutive tokens differ)', () => {
    const a = randomToken();
    const b = randomToken();
    expect(a).not.toBe(b); // 24 animals x 9000 x ~32768 -> collision practically impossible
  });
});

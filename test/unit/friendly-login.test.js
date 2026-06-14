// Unit tests for the friendly login name generator (used for Google accounts:
// login == password, so names MUST satisfy Google's 8-char password minimum).
import {describe, it, expect} from 'vitest';
import { friendlyLogin } from '../../src/index.js';

describe('friendlyLogin', () => {
  it('always produces word + 4 digits, lowercase only', () => {
    for (let i = 0; i < 300; i++) {
      expect(friendlyLogin()).toMatch(/^[a-z]+\d{4}$/);
    }
  });

  it('is always at least 8 characters (Google password minimum)', () => {
    for (let i = 0; i < 300; i++) {
      expect(friendlyLogin().length).toBeGreaterThanOrEqual(8);
    }
  });

  it('produces varied names (no constant output)', () => {
    const names = new Set();
    for (let i = 0; i < 50; i++) names.add(friendlyLogin());
    expect(names.size).toBeGreaterThan(10);
  });
});

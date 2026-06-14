// Unit tests for the configuration path of src/lib/google.js.
// Network calls (create/delete) are NOT tested here — they are covered by
// mocks in later phases and a manual live smoke test (scripts/test-google-module.mjs).
import {describe, it, expect} from 'vitest';
import { googleConfig } from '../../src/lib/google.js';

const VALID_KEY = JSON.stringify({
  type: 'service_account',
  client_email: 'robot@example.iam.gserviceaccount.com',
  private_key: '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n',
});

const FULL_ENV = {
  GOOGLE_SA_KEY: VALID_KEY,
  GOOGLE_ADMIN_SUBJECT: 'admin@id.example.com',
  GOOGLE_ACCOUNT_DOMAIN: 'id.example.com',
};

describe('googleConfig (feature is off unless fully configured)', () => {
  it('returns null when nothing is configured', () => {
    expect(googleConfig({})).toBeNull();
    expect(googleConfig(null)).toBeNull();
    expect(googleConfig(undefined)).toBeNull();
  });

  it('returns null when any required value is missing', () => {
    expect(googleConfig({ ...FULL_ENV, GOOGLE_SA_KEY: undefined })).toBeNull();
    expect(googleConfig({ ...FULL_ENV, GOOGLE_ADMIN_SUBJECT: undefined })).toBeNull();
    expect(googleConfig({ ...FULL_ENV, GOOGLE_ACCOUNT_DOMAIN: undefined })).toBeNull();
  });

  it('returns null for malformed key JSON instead of throwing', () => {
    expect(googleConfig({ ...FULL_ENV, GOOGLE_SA_KEY: 'not-json{' })).toBeNull();
  });

  it('returns null when key JSON lacks client_email/private_key', () => {
    expect(googleConfig({ ...FULL_ENV, GOOGLE_SA_KEY: '{}' })).toBeNull();
  });

  it('returns a complete config when everything is set', () => {
    const cfg = googleConfig(FULL_ENV);
    expect(cfg).not.toBeNull();
    expect(cfg.subject).toBe('admin@id.example.com');
    expect(cfg.domain).toBe('id.example.com');
    expect(cfg.key.client_email).toBe('robot@example.iam.gserviceaccount.com');
  });
});

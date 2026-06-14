// Settings store with a strict precedence chain:
//   1. settings table (set via admin UI / setup assistant)
//   2. environment variable or secret (legacy / power-user way)
//   3. built-in default
// An empty settings table therefore means: exactly today's behavior.
//
// All SQL lives in the db layer (src/db/queries.js); this module only adds the
// precedence chain + typed helpers on top (no inline SQL in the domain layer).
import { getSettingValue, upsertSetting, deleteSettingRow } from '../db/queries.js';

const DEFAULT_TTL_HOURS = 48; // max address/account lifetime (no UI countdown) — lets a trainer activate the evening before

export async function getSetting(env, key) {
  return await getSettingValue(env.DB, key);
}

export async function setSetting(env, key, value) {
  await upsertSetting(env.DB, key, value, Date.now());
}

export async function deleteSetting(env, key) {
  await deleteSettingRow(env.DB, key);
}

// Generic precedence resolver: DB value -> env var/secret -> default.
export async function resolveConfig(env, key, envName, defaultValue = null) {
  const fromDb = await getSetting(env, key);
  if (fromDb !== null && fromDb !== '') return fromDb;
  if (envName && env[envName] !== undefined && env[envName] !== '') return env[envName];
  return defaultValue;
}

// Feature flags live in the same table as 'flag_<name>' with value '1'/'0'.
export async function isFlagEnabled(env, name, defaultValue = false) {
  const v = await getSetting(env, `flag_${name}`);
  if (v === null) return defaultValue;
  return v === '1';
}

export async function setFlag(env, name, enabled) {
  await setSetting(env, `flag_${name}`, enabled ? '1' : '0');
}

// Address/mailbox retention in hours — the single source of truth for both the
// real expiry AND the legal texts. Precedence: settings 'address_ttl_hours' ->
// env ADDRESS_TTL_HOURS -> default. Changeable later (e.g. an admin slider)
// without touching code or the legal copy.
export async function ttlHours(env) {
  const raw = await resolveConfig(env, 'address_ttl_hours', 'ADDRESS_TTL_HOURS', String(DEFAULT_TTL_HOURS));
  const v = parseInt(raw, 10);
  return Number.isFinite(v) && v > 0 ? v : DEFAULT_TTL_HOURS;
}

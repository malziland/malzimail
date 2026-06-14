// The single home for every D1 SQL statement. Each function takes the D1 binding
// (env.DB) as its first argument and returns the same shape the caller used, so
// the call sites are pure data access with no inline SQL.
//
// Concurrency: D1 serializes writes per database (single-writer), so the cron
// cleanup and the request handlers don't need explicit transactions for
// correctness at this scale. Address minting relies on the `addresses` PRIMARY
// KEY to reject collisions (insert-then-retry), not on a read-modify-write race.
// Add explicit transactions only if a future feature needs atomicity across
// multiple statements.

// ---------- email path ----------

export async function findAddressForDelivery(db, to) {
  return await db.prepare(
    `SELECT addresses.expires_at, addresses.first_mail_at, addresses.trainer_token,
            trainers.active_until AS trainer_active_until,
            trainers.enabled       AS trainer_enabled
     FROM addresses
     LEFT JOIN trainers ON trainers.token = addresses.trainer_token
     WHERE addresses.address = ?`
  ).bind(to).first();
}

export async function insertMessage(db, { to, from, subjectEnc, textEnc, htmlEnc, rawSize, now }) {
  return await db.prepare(
    `INSERT INTO messages
      (to_addr, from_addr, subject, text_body, html_body, raw_size, received_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    to,
    from,
    subjectEnc,
    textEnc,
    htmlEnc,
    rawSize,
    now
  ).run();
}

export async function setFirstMailAt(db, now, to) {
  return await db.prepare(
    'UPDATE addresses SET first_mail_at = ? WHERE address = ? AND first_mail_at IS NULL'
  ).bind(now, to).run();
}

// ---------- scheduled / cleanup ----------

export async function deleteOldMessages(db, cutoff) {
  return await db.prepare(
    'DELETE FROM messages WHERE received_at < ?'
  ).bind(cutoff).run();
}

// Retention cleanup that honours the per-address lifetime (PRIV-03): delete a
// message once ITS address has expired (created_at + ttlHours, capped at the
// workshop end), plus an absolute hard cap on message age as a backstop.
export async function deleteRetiredMessages(db, hardCutoff, now) {
  return await db.prepare(
    'DELETE FROM messages WHERE received_at < ? OR to_addr IN (SELECT address FROM addresses WHERE expires_at <= ?)'
  ).bind(hardCutoff, now).run();
}

export async function findExpiredGoogleAddresses(db, now) {
  return await db.prepare(
    'SELECT address, google_login FROM addresses WHERE google_login IS NOT NULL AND expires_at < ? LIMIT 50'
  ).bind(now).all();
}

export async function clearGoogleLogin(db, address) {
  return await db.prepare(
    'UPDATE addresses SET google_login = NULL, google_password_enc = NULL WHERE address = ?'
  ).bind(address).run();
}

// ---------- createAddress ----------

export async function insertAddress(db, address, now, expiresAt, token) {
  return await db.prepare(
    'INSERT OR IGNORE INTO addresses (address, created_at, expires_at, trainer_token) VALUES (?, ?, ?, ?)'
  ).bind(address, now, expiresAt, token).run();
}

export async function setAddressGoogle(db, googleEmail, encPw, address) {
  return await db.prepare(
    'UPDATE addresses SET google_login = ?, google_password_enc = ? WHERE address = ?'
  ).bind(googleEmail, encPw, address).run();
}

export async function deleteAddress(db, address) {
  return await db.prepare('DELETE FROM addresses WHERE address = ?').bind(address).run();
}

// ---------- status / messages ----------

export async function findAddressTimes(db, to) {
  return await db.prepare(
    'SELECT created_at, expires_at, trainer_token FROM addresses WHERE address = ?'
  ).bind(to).first();
}

export async function findAddressExpiry(db, to) {
  return await db.prepare('SELECT expires_at, trainer_token FROM addresses WHERE address = ?').bind(to).first();
}

export async function listMessageHeaders(db, to, limit) {
  return await db.prepare(
    'SELECT id, from_addr, subject, received_at FROM messages WHERE to_addr = ? ORDER BY received_at DESC LIMIT ?'
  ).bind(to, limit).all();
}

export async function getMessageRow(db, id, to) {
  return await db.prepare(
    'SELECT id, from_addr, subject, text_body, html_body, received_at FROM messages WHERE id = ? AND to_addr = ?'
  ).bind(id, to).first();
}

export async function listMessagesFull(db, to, limit) {
  return await db.prepare(
    'SELECT id, from_addr, subject, text_body, html_body, raw_size, received_at FROM messages WHERE to_addr = ? ORDER BY received_at ASC LIMIT ?'
  ).bind(to, limit).all();
}

// ---------- google stats / wipe ----------

export async function countActiveGoogleAccounts(db) {
  return await db.prepare('SELECT COUNT(*) AS cnt FROM addresses WHERE google_login IS NOT NULL').first();
}

export async function findAddressesWithGoogle(db) {
  return await db.prepare(
    'SELECT address, google_login FROM addresses WHERE google_login IS NOT NULL'
  ).all();
}

export async function deleteMessagesForActiveAddresses(db, now) {
  return await db.prepare('DELETE FROM messages WHERE to_addr IN (SELECT address FROM addresses WHERE expires_at > ?)').bind(now).run();
}

export async function retireActiveAddresses(db, now) {
  return await db.prepare('UPDATE addresses SET expires_at = 0 WHERE expires_at > ?').bind(now).run();
}

// ---------- admin / workshop ----------

export async function findWorkshopTrainer(db, token) {
  return await db.prepare('SELECT token, name, active_until, enabled FROM trainers WHERE token = ?').bind(token).first();
}

export async function findFirstTrainer(db) {
  return await db.prepare('SELECT token, name, active_until, enabled FROM trainers ORDER BY created_at LIMIT 1').first();
}

export async function deactivateAllTrainers(db) {
  return await db.prepare('UPDATE trainers SET active_until = 0').run();
}

export async function insertWorkshopTrainer(db, { token, name, secretHash, secretEncrypted, activeUntil, now }) {
  return await db.prepare(
    'INSERT OR IGNORE INTO trainers (token, name, secret_hash, secret_encrypted, daily_used_limit, daily_gen_limit, active_until, enabled, created_at, notes, google_enabled) VALUES (?, ?, ?, ?, NULL, NULL, ?, 1, ?, NULL, 1)'
  ).bind(token, name, secretHash, secretEncrypted, activeUntil, now).run();
}

// ---------- trainers / counts ----------

export async function getTrainer(db, token) {
  return await db.prepare(
    'SELECT token, name, secret_hash, secret_encrypted, daily_used_limit, daily_gen_limit, active_until, enabled, created_at, notes, google_enabled FROM trainers WHERE token = ?'
  ).bind(token).first();
}

export async function countGeneratedToday(db, token, todayStart) {
  return await db.prepare(
    'SELECT COUNT(*) AS cnt FROM addresses WHERE trainer_token = ? AND created_at >= ?'
  ).bind(token, todayStart).first();
}

export async function countUsedToday(db, token, todayStart) {
  return await db.prepare(
    'SELECT COUNT(*) AS cnt FROM addresses WHERE trainer_token = ? AND first_mail_at >= ?'
  ).bind(token, todayStart).first();
}

// ---------- settings (key/value store; precedence logic lives in domain/settings.js) ----------

export async function getSettingValue(db, key) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row ? row.value : null;
}

export async function upsertSetting(db, key, value, now) {
  await db.prepare(
    'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ' +
    'ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
  ).bind(key, value, now).run();
}

export async function deleteSettingRow(db, key) {
  await db.prepare('DELETE FROM settings WHERE key = ?').bind(key).run();
}

// Newest received message timestamp (ms) across all addresses — null if none yet.
// Powers the admin self-check: "has this instance ever actually received mail?"
export async function lastMessageAt(db) {
  const row = await db.prepare('SELECT MAX(received_at) AS last FROM messages').first();
  return row ? row.last : null;
}

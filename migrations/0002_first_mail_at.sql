-- Tracks when the FIRST mail arrived for an address.
-- Stays NULL for addresses that were generated but never received any mail.
-- Used for stats (which addresses were actually used?) and future trainer-quota features.
-- No cleanup logic — addresses still stay forever for uniqueness protection.
ALTER TABLE addresses ADD COLUMN first_mail_at INTEGER;

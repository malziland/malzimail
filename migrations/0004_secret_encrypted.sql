-- Store the cleartext secret in encrypted form so the admin can retrieve
-- the activation link without having to rotate. Encryption uses the same
-- MAIL_ENCRYPTION_KEY as for message bodies. Hash column stays for fast auth.
ALTER TABLE trainers ADD COLUMN secret_encrypted TEXT;

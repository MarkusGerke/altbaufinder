-- Passwort-zurücksetzen (einmalig; bei „Duplicate column“ ignorieren)
ALTER TABLE users ADD COLUMN password_reset_token_hash VARCHAR(64) NULL AFTER password_hash;
ALTER TABLE users ADD COLUMN password_reset_expires_at DATETIME NULL AFTER password_reset_token_hash;

-- Anzeigename für Highscore (eindeutig, max. 64 Zeichen).
-- Vor Ausführung: Backup der DB.

ALTER TABLE users
  ADD COLUMN display_name VARCHAR(64) NULL UNIQUE AFTER email;

-- Bestehende Konten: Anzeigename nachziehen (ensure_users_display_name in auth_helpers.php erledigt das auch per PHP).

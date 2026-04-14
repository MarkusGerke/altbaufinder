-- Fünf Klassifikationswerte, Nutzer, Punkte pro markiertem Gebäude.
-- Vor Ausführung: Backup der DB.

-- Alte ENUM-Werte auf VARCHAR umstellen (falls noch ENUM)
ALTER TABLE classifications
  MODIFY COLUMN classification VARCHAR(32) NULL;

UPDATE classifications SET classification = 'stuck_perfekt' WHERE classification = 'original';
UPDATE classifications SET classification = 'stuck_teilweise' WHERE classification = 'altbau_entstuckt';
UPDATE classifications SET classification = NULL WHERE classification = 'kein_altbau';

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_building_marks (
  user_id INT UNSIGNED NOT NULL,
  building_id VARCHAR(128) NOT NULL,
  marked_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, building_id),
  CONSTRAINT fk_ubm_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

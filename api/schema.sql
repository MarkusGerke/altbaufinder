CREATE TABLE IF NOT EXISTS classifications (
  building_id VARCHAR(128) NOT NULL PRIMARY KEY,
  classification VARCHAR(32) NULL,
  year_of_construction INT NULL,
  geometry_json LONGTEXT NULL,
  building_use VARCHAR(64) NULL,
  last_modified BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  can_upload_photos TINYINT(1) NOT NULL DEFAULT 1,
  password_reset_token_hash VARCHAR(64) NULL,
  password_reset_expires_at DATETIME NULL,
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

CREATE TABLE IF NOT EXISTS building_photos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  building_id VARCHAR(128) NOT NULL,
  filename VARCHAR(80) NOT NULL,
  moderation_status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id INT UNSIGNED NULL,
  UNIQUE KEY uq_building_one (building_id),
  CONSTRAINT fk_bp_building FOREIGN KEY (building_id) REFERENCES classifications (building_id) ON DELETE CASCADE,
  CONSTRAINT fk_bp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
